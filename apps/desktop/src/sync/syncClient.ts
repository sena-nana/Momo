import {
  createListTaskConflictsRequest,
  createDeltaPushRequest,
  type DeltaPushResponse,
  type DeltaPushRequest,
  type ListTaskConflictsResponse,
  type LocalChangeDto,
  type TaskConflictDto,
} from "../../../../packages/contracts/src";
import type { LocalChange, TaskRepository } from "../data/taskRepository";

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
  pendingConflictCount: number;
  pendingConflicts: PendingConflictSummary[];
}

export type SyncRunnerTransport = LocalSyncSimulationApi;

export interface SyncRunnerOptions {
  repository: Pick<
    TaskRepository,
    "listPendingChanges" | "markChangeSynced" | "saveSyncState"
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
        await repository.saveSyncState({
          serverCursor: result.push.serverCursor,
          lastSyncedAt: startedAt.toISOString(),
          lastError: null,
        });
        return {
          ok: true,
          result,
        };
      } catch (e) {
        const error = getErrorMessage(e);
        await repository.saveSyncState({
          serverCursor: null,
          lastSyncedAt: null,
          lastError: error,
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
