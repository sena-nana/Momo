import {
  createDeltaPushRequest,
  type DeltaPushResponse,
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

export interface ApplyDeltaPushResponseOptions {
  repository: Pick<TaskRepository, "markChangeSynced">;
  response: DeltaPushResponse;
  syncedAt: Date;
}

export async function applyDeltaPushResponse({
  repository,
  response,
  syncedAt,
}: ApplyDeltaPushResponseOptions) {
  for (const changeId of response.acceptedChangeIds) {
    await repository.markChangeSynced(changeId, syncedAt);
  }

  return {
    acceptedChangeIds: response.acceptedChangeIds,
    rejectedChanges: response.rejectedChanges,
    conflicts: response.conflicts,
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
