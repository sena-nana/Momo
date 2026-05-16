import { createDeltaPushRequest, type LocalChangeDto } from "../../../../packages/contracts/src";
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
