export const SYNC_CONTRACT_VERSION = 1;

export type TaskStatusDto = "active" | "completed" | "archived";
export type LocalChangeActionDto =
  | "task.create"
  | "task.update"
  | "task.status"
  | "task.delete";

export interface TaskDto {
  id: string;
  workspaceId: string;
  title: string;
  notes: string | null;
  status: TaskStatusDto;
  priority: 0 | 1 | 2 | 3;
  dueAt: string | null;
  estimateMin: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  version: number;
}

export interface LocalChangeDto {
  id: string;
  entityType: "task";
  entityId: string;
  action: LocalChangeActionDto;
  payload: unknown;
  createdAt: string;
}

export interface TaskConflictDto {
  id: string;
  workspaceId: string;
  taskId: string;
  changeId: string;
  reason: string;
  clientPayload: unknown;
  serverTask: TaskDto | null;
  createdAt: string;
}

export type ConflictResolutionStrategyDto =
  | "client_wins"
  | "server_wins"
  | "manual";

export interface ResolveTaskConflictRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
  conflictId: string;
  strategy: ConflictResolutionStrategyDto;
  resolvedBy: string;
  note: string | null;
}

export interface ResolveTaskConflictResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  conflictId: string;
  strategy: ConflictResolutionStrategyDto;
  status: "resolved" | "pending_manual";
  resolvedTask: TaskDto | null;
  serverCursor: string;
  serverTime: string;
}

export interface ListTaskConflictsRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
}

export interface ListTaskConflictsResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  conflicts: TaskConflictDto[];
  serverCursor: string;
  serverTime: string;
}

export interface DeltaPushRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
  changes: LocalChangeDto[];
  clientSentAt: string;
}

export interface DeltaPushResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  acceptedChangeIds: string[];
  rejectedChanges: Array<{
    id: string;
    reason: string;
  }>;
  conflicts: TaskConflictDto[];
  serverCursor: string;
  serverTime: string;
}

export interface DeltaPullRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
  sinceCursor: string | null;
}

export interface DeltaPullResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  tasks: TaskDto[];
  deletedTaskIds: string[];
  serverCursor: string;
  serverTime: string;
}

export function createDeltaPushRequest(input: {
  workspaceId: string;
  deviceId: string;
  changes: LocalChangeDto[];
  now: Date;
}): DeltaPushRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    changes: input.changes,
    clientSentAt: input.now.toISOString(),
  };
}

export function createDeltaPullRequest(input: {
  workspaceId: string;
  deviceId: string;
  sinceCursor: string | null;
}): DeltaPullRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    sinceCursor: input.sinceCursor,
  };
}

export function createTaskConflict(input: Omit<TaskConflictDto, "createdAt"> & {
  now: Date;
}): TaskConflictDto {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    changeId: input.changeId,
    reason: input.reason,
    clientPayload: input.clientPayload,
    serverTask: input.serverTask,
    createdAt: input.now.toISOString(),
  };
}

export function createResolveTaskConflictRequest(input: {
  workspaceId: string;
  deviceId: string;
  conflictId: string;
  strategy: ConflictResolutionStrategyDto;
  resolvedBy: string;
  note?: string | null;
}): ResolveTaskConflictRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    conflictId: input.conflictId,
    strategy: input.strategy,
    resolvedBy: input.resolvedBy,
    note: input.note ?? null,
  };
}

export function createListTaskConflictsRequest(input: {
  workspaceId: string;
  deviceId: string;
}): ListTaskConflictsRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
  };
}
