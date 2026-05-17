import {
  createDeltaPullRequest,
  createListTaskConflictsRequest,
  createDeltaPushRequest,
  type DeltaPullResponse,
  type DeltaPullRequest,
  type DeltaPushResponse,
  type DeltaPushRequest,
  type ListTaskConflictsResponse,
  type LocalChangeDto,
  type TaskConflictDto,
  type TaskDto,
} from "../../../../packages/contracts/src";
import type { LocalChange, TaskRepository } from "../data/taskRepository";
import type { Task } from "../domain/tasks";

export interface BuildDeltaPushOptions {
  repository: Pick<TaskRepository, "listPendingChanges">;
  workspaceId: string;
  deviceId: string;
  now: Date;
}

export async function buildDeltaPushFromPendingChanges({
  repository,
  workspaceId,
  deviceId,
  now,
}: BuildDeltaPushOptions) {
  const changes = await repository.listPendingChanges();

  return createDeltaPushRequest({
    workspaceId,
    deviceId,
    changes: changes.map(toLocalChangeDto),
    now,
  });
}

export interface LocalSyncSimulationApi {
  deltaPush(request: DeltaPushRequest): Promise<DeltaPushResponse>;
  deltaPull?(request: DeltaPullRequest): Promise<DeltaPullResponse>;
  listConflicts(request: {
    contractVersion: 1;
    workspaceId: string;
    deviceId: string;
  }): Promise<ListTaskConflictsResponse>;
}

export interface RunLocalSyncSimulationOptions {
  repository: Pick<TaskRepository, "listPendingChanges" | "markChangeSynced">;
  syncApi: LocalSyncSimulationApi;
  workspaceId: string;
  deviceId: string;
  now: Date;
}

export interface LocalSyncSimulationResult {
  request: DeltaPushRequest;
  push: ApplyDeltaPushResult;
  pull?: ApplyDeltaPullResult;
  pendingConflictCount: number;
  pendingConflicts: PendingConflictSummary[];
}

export type SyncRunnerTransport = LocalSyncSimulationApi;

export interface SyncRunnerOptions {
  repository: Pick<
    TaskRepository,
    | "listPendingChanges"
    | "markChangeSynced"
    | "getSyncState"
    | "applyRemoteTask"
    | "deleteRemoteTask"
    | "saveSyncState"
    | "recordSyncRun"
  >;
  transport: SyncRunnerTransport;
  workspaceId: string;
  deviceId: string;
  now: () => Date;
}

export type SyncRunnerRunOnceResult =
  | {
    ok: true;
    result: LocalSyncSimulationResult;
  }
  | {
    ok: false;
    error: string;
    result: null;
  };

export interface SyncRunner {
  runOnce(): Promise<SyncRunnerRunOnceResult>;
}

export function createSyncRunner({
  repository,
  transport,
  workspaceId,
  deviceId,
  now,
}: SyncRunnerOptions): SyncRunner {
  return {
    async runOnce() {
      const startedAt = now();
      try {
        const result = await runLocalSyncSimulation({
          repository,
          syncApi: transport,
          workspaceId,
          deviceId,
          now: startedAt,
        });
        if (transport.deltaPull) {
          const syncState = await repository.getSyncState();
          const pullResponse = await transport.deltaPull(
            createDeltaPullRequest({
              workspaceId,
              deviceId,
              sinceCursor: syncState.serverCursor,
            }),
          );
          result.pull = await applyDeltaPullResponse({
            repository,
            response: pullResponse,
            syncedAt: startedAt,
          });
        } else {
          await repository.saveSyncState({
            serverCursor: result.push.serverCursor,
            lastSyncedAt: startedAt.toISOString(),
            lastError: null,
          });
        }
        await recordSyncRunBestEffort(repository, {
          status: "succeeded",
          startedAt: startedAt.toISOString(),
          finishedAt: now().toISOString(),
          message: result.push.summary.message,
          serverCursor: result.pull?.serverCursor ?? result.push.serverCursor,
        });
        return {
          ok: true,
          result,
        };
      } catch (e) {
        const error = getErrorMessage(e);
        await saveSyncStateBestEffort(repository, {
          serverCursor: null,
          lastSyncedAt: null,
          lastError: error,
        });
        await recordSyncRunBestEffort(repository, {
          status: "failed",
          startedAt: startedAt.toISOString(),
          finishedAt: now().toISOString(),
          message: error,
          serverCursor: null,
        });
        return {
          ok: false,
          error,
          result: null,
        };
      }
    },
  };
}

async function recordSyncRunBestEffort(
  repository: Pick<TaskRepository, "recordSyncRun">,
  input: Parameters<TaskRepository["recordSyncRun"]>[0],
) {
  try {
    await repository.recordSyncRun(input);
  } catch {
    // Sync history is diagnostic only; do not hide the primary sync outcome.
  }
}

async function saveSyncStateBestEffort(
  repository: Pick<TaskRepository, "saveSyncState">,
  state: Parameters<TaskRepository["saveSyncState"]>[0],
) {
  try {
    await repository.saveSyncState(state);
  } catch {
    // Keep the original sync failure visible to callers even if state persistence fails.
  }
}

export async function runLocalSyncSimulation({
  repository,
  syncApi,
  workspaceId,
  deviceId,
  now,
}: RunLocalSyncSimulationOptions): Promise<LocalSyncSimulationResult> {
  const request = await buildDeltaPushFromPendingChanges({
    repository,
    workspaceId,
    deviceId,
    now,
  });
  const response = await syncApi.deltaPush(request);
  const push = await applyDeltaPushResponse({
    repository,
    response,
    syncedAt: now,
  });
  const conflicts = await syncApi.listConflicts(
    createListTaskConflictsRequest({ workspaceId, deviceId }),
  );
  const pendingConflicts = summarizePendingConflicts(conflicts.conflicts);

  return {
    request,
    push,
    pendingConflictCount: pendingConflicts.length,
    pendingConflicts,
  };
}

export interface ApplyDeltaPushResponseOptions {
  repository: Pick<TaskRepository, "markChangeSynced">;
  response: DeltaPushResponse;
  syncedAt: Date;
}

export interface ApplyDeltaPushResult {
  acceptedChangeIds: string[];
  rejectedChanges: DeltaPushResponse["rejectedChanges"];
  conflicts: TaskConflictDto[];
  serverCursor: string;
  summary: SyncRunSummary;
}

export async function applyDeltaPushResponse({
  repository,
  response,
  syncedAt,
}: ApplyDeltaPushResponseOptions): Promise<ApplyDeltaPushResult> {
  for (const changeId of response.acceptedChangeIds) {
    await repository.markChangeSynced(changeId, syncedAt);
  }

  return {
    acceptedChangeIds: response.acceptedChangeIds,
    rejectedChanges: response.rejectedChanges,
    conflicts: response.conflicts,
    serverCursor: response.serverCursor,
    summary: summarizeDeltaPushResponse(response),
  };
}

export interface ApplyDeltaPullResponseOptions {
  repository: Pick<
    TaskRepository,
    "applyRemoteTask" | "deleteRemoteTask" | "saveSyncState"
  >;
  response: DeltaPullResponse;
  syncedAt: Date;
}

export interface ApplyDeltaPullResult {
  appliedTaskCount: number;
  deletedTaskCount: number;
  serverCursor: string;
}

export async function applyDeltaPullResponse({
  repository,
  response,
  syncedAt,
}: ApplyDeltaPullResponseOptions): Promise<ApplyDeltaPullResult> {
  for (const task of response.tasks) {
    await repository.applyRemoteTask(toLocalTask(task), task.version);
  }
  for (const taskId of response.deletedTaskIds) {
    await repository.deleteRemoteTask(taskId);
  }
  await repository.saveSyncState({
    serverCursor: response.serverCursor,
    lastSyncedAt: syncedAt.toISOString(),
    lastError: null,
  });

  return {
    appliedTaskCount: response.tasks.length,
    deletedTaskCount: response.deletedTaskIds.length,
    serverCursor: response.serverCursor,
  };
}

export const SYNC_RUN_STATUSES = [
  "all-synced",
  "has-rejections",
  "has-conflicts",
] as const;

export type SyncRunStatus = typeof SYNC_RUN_STATUSES[number];

export interface SyncRunSummary {
  status: SyncRunStatus;
  message: string;
  acceptedCount: number;
  rejectedCount: number;
  conflictCount: number;
  serverCursor: string;
}

export function summarizeDeltaPushResponse(
  response: DeltaPushResponse,
): SyncRunSummary {
  const acceptedCount = response.acceptedChangeIds.length;
  const rejectedCount = response.rejectedChanges.length;
  const conflictCount = response.conflicts.length;

  if (conflictCount > 0) {
    return {
      status: "has-conflicts",
      message: `${conflictCount} sync conflict${conflictCount === 1 ? "" : "s"} needs review`,
      acceptedCount,
      rejectedCount,
      conflictCount,
      serverCursor: response.serverCursor,
    };
  }

  if (rejectedCount > 0) {
    return {
      status: "has-rejections",
      message: `${rejectedCount} local change${rejectedCount === 1 ? "" : "s"} needs retry or repair`,
      acceptedCount,
      rejectedCount,
      conflictCount,
      serverCursor: response.serverCursor,
    };
  }

  return {
    status: "all-synced",
    message: acceptedCount === 0
      ? "Already synced"
      : `${acceptedCount} local change${acceptedCount === 1 ? "" : "s"} synced`,
    acceptedCount,
    rejectedCount,
    conflictCount,
    serverCursor: response.serverCursor,
  };
}

export interface PendingConflictSummary {
  id: string;
  taskId: string;
  changeId: string;
  reason: string;
  createdAt: string;
  serverTaskTitle: string | null;
  serverTaskVersion: number | null;
  clientPayloadSummary: string;
}

export interface PendingConflictDetailSummary extends PendingConflictSummary {
  localChange: PendingLocalChangeSummary | null;
}

export interface PendingLocalChangeSummary {
  id: string;
  entityLabel: string;
  action: LocalChange["action"];
  createdAt: string;
  payloadSummary: string;
}

export interface RejectedChangeSummary {
  id: string;
  reason: string;
  localChange: PendingLocalChangeSummary | null;
}

export function summarizePendingLocalChanges(
  changes: LocalChange[],
  limit = 5,
): PendingLocalChangeSummary[] {
  const normalizedLimit = Math.max(0, Math.floor(limit));
  return changes.slice(0, normalizedLimit).map((change) => ({
    id: change.id,
    entityLabel: `${change.entityType}:${change.entityId}`,
    action: change.action,
    createdAt: change.createdAt,
    payloadSummary: summarizeClientPayload(change.payload),
  }));
}

export function summarizeRejectedChanges(
  rejectedChanges: DeltaPushResponse["rejectedChanges"],
  pendingChanges: PendingLocalChangeSummary[],
): RejectedChangeSummary[] {
  const pendingById = new Map(
    pendingChanges.map((change) => [change.id, change]),
  );

  return rejectedChanges.map((rejection) => ({
    id: rejection.id,
    reason: rejection.reason,
    localChange: pendingById.get(rejection.id) ?? null,
  }));
}

export function summarizePendingConflicts(
  conflicts: TaskConflictDto[],
): PendingConflictSummary[] {
  return conflicts.map((conflict) => ({
    id: conflict.id,
    taskId: conflict.taskId,
    changeId: conflict.changeId,
    reason: conflict.reason,
    createdAt: conflict.createdAt,
    serverTaskTitle: conflict.serverTask?.title ?? null,
    serverTaskVersion: conflict.serverTask?.version ?? null,
    clientPayloadSummary: summarizeClientPayload(conflict.clientPayload),
  }));
}

export function summarizePendingConflictDetails(
  conflicts: PendingConflictSummary[],
  pendingChanges: PendingLocalChangeSummary[],
): PendingConflictDetailSummary[] {
  const pendingById = new Map(
    pendingChanges.map((change) => [change.id, change]),
  );

  return conflicts.map((conflict) => ({
    ...conflict,
    localChange: pendingById.get(conflict.changeId) ?? null,
  }));
}

function toLocalChangeDto(change: LocalChange): LocalChangeDto {
  return {
    id: change.id,
    entityType: change.entityType,
    entityId: change.entityId,
    action: change.action,
    payload: change.payload,
    createdAt: change.createdAt,
  };
}

function toLocalTask(task: TaskDto): Task {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    estimateMin: task.estimateMin,
    tags: task.tags,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}

function summarizeClientPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return String(payload);
  }

  const entries = Object.entries(payload as Record<string, unknown>).filter(
    ([key]) => key !== "id" && key !== "baseVersion" && key !== "updatedAt",
  );
  if (entries.length === 0) {
    return "empty payload";
  }

  return entries
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
