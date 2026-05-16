import {
  SYNC_CONTRACT_VERSION,
  createTaskConflict,
  type DeltaPullRequest,
  type DeltaPullResponse,
  type DeltaPushRequest,
  type DeltaPushResponse,
  type LocalChangeDto,
  type TaskConflictDto,
  type TaskDto,
  type TaskStatusDto,
} from "../../../packages/contracts/src";

export * from "./tasks";
export * from "./router";

export interface SyncApi {
  deltaPush(request: DeltaPushRequest): Promise<DeltaPushResponse>;
  deltaPull(request: DeltaPullRequest): Promise<DeltaPullResponse>;
}

export interface SyncStore {
  applyChange(
    workspaceId: string,
    change: LocalChangeDto,
    now: Date,
  ): Promise<ApplyChangeResult>;
  listChanges(workspaceId: string, sinceCursor: string | null): Promise<SyncSnapshot>;
  currentCursor(workspaceId: string): Promise<string>;
}

export interface ApplyChangeResult {
  conflict?: TaskConflictDto;
}

export interface SyncSnapshot {
  cursor: string;
  tasks: TaskDto[];
  deletedTaskIds: string[];
}

interface SyncApiOptions {
  store: SyncStore;
  now?: () => Date;
}

interface StoredWorkspace {
  version: number;
  tasks: Map<string, TaskDto>;
  deletedTaskIds: Set<string>;
  taskVersions: Map<string, number>;
  deleteVersions: Map<string, number>;
  appliedChangeIds: Set<string>;
}

interface TaskPayload {
  id: string;
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
}

interface TaskUpdatePayload {
  id?: string;
  baseVersion?: number;
  patch: Partial<Pick<
    TaskDto,
    | "title"
    | "notes"
    | "status"
    | "priority"
    | "dueAt"
    | "estimateMin"
    | "tags"
    | "completedAt"
  >>;
  updatedAt: string;
}

interface TaskStatusPayload {
  id?: string;
  baseVersion?: number;
  status: TaskStatusDto;
  completedAt: string | null;
  updatedAt: string;
}

export function createSyncApi({ store, now = () => new Date() }: SyncApiOptions): SyncApi {
  return {
    async deltaPush(request) {
      assertSupportedContract(request.contractVersion);
      const acceptedChangeIds: string[] = [];
      const rejectedChanges: DeltaPushResponse["rejectedChanges"] = [];
      const conflicts: TaskConflictDto[] = [];

      for (const change of request.changes) {
        try {
          const result = await store.applyChange(request.workspaceId, change, now());
          if (result.conflict) {
            conflicts.push(result.conflict);
          } else {
            acceptedChangeIds.push(change.id);
          }
        } catch (error) {
          rejectedChanges.push({
            id: change.id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        acceptedChangeIds,
        rejectedChanges,
        conflicts,
        serverCursor: await store.currentCursor(request.workspaceId),
        serverTime: now().toISOString(),
      };
    },

    async deltaPull(request) {
      assertSupportedContract(request.contractVersion);
      const snapshot = await store.listChanges(request.workspaceId, request.sinceCursor);

      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        tasks: snapshot.tasks,
        deletedTaskIds: snapshot.deletedTaskIds,
        serverCursor: snapshot.cursor,
        serverTime: now().toISOString(),
      };
    },
  };
}

export function createInMemorySyncStore(): SyncStore {
  const workspaces = new Map<string, StoredWorkspace>();

  function workspaceFor(workspaceId: string) {
    let workspace = workspaces.get(workspaceId);
    if (!workspace) {
      workspace = {
        version: 0,
        tasks: new Map(),
        deletedTaskIds: new Set(),
        taskVersions: new Map(),
        deleteVersions: new Map(),
        appliedChangeIds: new Set(),
      };
      workspaces.set(workspaceId, workspace);
    }
    return workspace;
  }

  return {
    async applyChange(workspaceId, change, currentTime) {
      const workspace = workspaceFor(workspaceId);

      if (change.entityType !== "task") {
        throw new Error("Unsupported entity type");
      }
      if (workspace.appliedChangeIds.has(change.id)) {
        return {};
      }

      if (change.action === "task.delete") {
        const version = workspace.version + 1;
        workspace.version = version;
        workspace.tasks.delete(change.entityId);
        workspace.deletedTaskIds.add(change.entityId);
        workspace.deleteVersions.set(change.entityId, version);
        workspace.appliedChangeIds.add(change.id);
        return {};
      }

      const existing = workspace.tasks.get(change.entityId);
      const conflict = detectVersionConflict({
        workspaceId,
        change,
        existing,
        now: currentTime,
      });
      if (conflict) {
        return { conflict };
      }

      const version = workspace.version + 1;
      const task = applyTaskChange({
        action: change.action,
        payload: change.payload,
        entityId: change.entityId,
        workspaceId,
        version,
        existing,
      });

      workspace.version = version;
      workspace.tasks.set(change.entityId, task);
      workspace.taskVersions.set(change.entityId, version);
      workspace.deletedTaskIds.delete(change.entityId);
      workspace.deleteVersions.delete(change.entityId);
      workspace.appliedChangeIds.add(change.id);
      return {};
    },

    async listChanges(workspaceId, sinceCursor) {
      const workspace = workspaceFor(workspaceId);
      const sinceVersion = parseCursor(sinceCursor);

      return {
        cursor: formatCursor(workspace.version),
        tasks: [...workspace.tasks.values()].filter(
          (task) => (workspace.taskVersions.get(task.id) ?? 0) > sinceVersion,
        ),
        deletedTaskIds: [...workspace.deletedTaskIds].filter(
          (taskId) => (workspace.deleteVersions.get(taskId) ?? 0) > sinceVersion,
        ),
      };
    },

    async currentCursor(workspaceId) {
      return formatCursor(workspaceFor(workspaceId).version);
    },
  };
}

function assertSupportedContract(contractVersion: number) {
  if (contractVersion !== SYNC_CONTRACT_VERSION) {
    throw new Error("Unsupported sync contract version");
  }
}

function normalizeTaskPayload(payload: unknown, entityId: string): TaskPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Task payload must be an object");
  }

  const candidate = payload as Partial<TaskPayload>;
  if (candidate.id && candidate.id !== entityId) {
    throw new Error("Task payload id must match entity id");
  }
  if (!candidate.title?.trim()) {
    throw new Error("Task title is required");
  }
  if (!candidate.createdAt || !candidate.updatedAt) {
    throw new Error("Task timestamps are required");
  }

  return {
    id: entityId,
    title: candidate.title.trim(),
    notes: candidate.notes ?? null,
    status: candidate.status ?? "active",
    priority: candidate.priority ?? 0,
    dueAt: candidate.dueAt ?? null,
    estimateMin: candidate.estimateMin ?? null,
    tags: candidate.tags ?? [],
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    completedAt: candidate.completedAt ?? null,
  };
}

function applyTaskChange(input: {
  action: LocalChangeDto["action"];
  payload: unknown;
  entityId: string;
  workspaceId: string;
  version: number;
  existing: TaskDto | undefined;
}): TaskDto {
  if (input.action === "task.create") {
    const payload = normalizeTaskPayload(input.payload, input.entityId);
    return {
      ...payload,
      id: input.entityId,
      workspaceId: input.workspaceId,
      version: input.version,
    };
  }

  if (!input.existing) {
    throw new Error("Task must exist before applying this change");
  }

  if (input.action === "task.update") {
    const payload = normalizeTaskUpdatePayload(input.payload, input.entityId);
    return {
      ...input.existing,
      ...payload.patch,
      id: input.entityId,
      workspaceId: input.workspaceId,
      updatedAt: payload.updatedAt,
      version: input.version,
    };
  }

  if (input.action === "task.status") {
    const payload = normalizeTaskStatusPayload(input.payload, input.entityId);
    return {
      ...input.existing,
      id: input.entityId,
      workspaceId: input.workspaceId,
      status: payload.status,
      completedAt: payload.completedAt,
      updatedAt: payload.updatedAt,
      version: input.version,
    };
  }

  throw new Error("Unsupported task action");
}

function normalizeTaskUpdatePayload(
  payload: unknown,
  entityId: string,
): TaskUpdatePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Task update payload must be an object");
  }

  const candidate = payload as Partial<TaskUpdatePayload>;
  assertMatchingPayloadId(candidate.id, entityId);
  if (!candidate.updatedAt) {
    throw new Error("Task update timestamp is required");
  }
  if (!candidate.patch || typeof candidate.patch !== "object") {
    throw new Error("Task update patch is required");
  }

  return {
    id: entityId,
    baseVersion: candidate.baseVersion,
    patch: normalizeTaskPatch(candidate.patch),
    updatedAt: candidate.updatedAt,
  };
}

function normalizeTaskStatusPayload(
  payload: unknown,
  entityId: string,
): TaskStatusPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Task status payload must be an object");
  }

  const candidate = payload as Partial<TaskStatusPayload>;
  assertMatchingPayloadId(candidate.id, entityId);
  if (!candidate.status) {
    throw new Error("Task status is required");
  }
  if (!candidate.updatedAt) {
    throw new Error("Task status timestamp is required");
  }

  return {
    id: entityId,
    baseVersion: candidate.baseVersion,
    status: candidate.status,
    completedAt: candidate.completedAt ?? null,
    updatedAt: candidate.updatedAt,
  };
}

function detectVersionConflict(input: {
  workspaceId: string;
  change: LocalChangeDto;
  existing: TaskDto | undefined;
  now: Date;
}) {
  if (!input.existing) return null;
  const baseVersion = readBaseVersion(input.change.payload);
  if (baseVersion == null || baseVersion === input.existing.version) {
    return null;
  }

  return createTaskConflict({
    id: `conflict-${input.change.id}`,
    workspaceId: input.workspaceId,
    taskId: input.change.entityId,
    changeId: input.change.id,
    reason: "Task version conflict",
    clientPayload: input.change.payload,
    serverTask: input.existing,
    now: input.now,
  });
}

function readBaseVersion(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { baseVersion?: unknown }).baseVersion;
  return typeof value === "number" ? value : null;
}

function normalizeTaskPatch(patch: TaskUpdatePayload["patch"]) {
  const normalized: TaskUpdatePayload["patch"] = {};
  if ("title" in patch) {
    const title = patch.title?.trim() ?? "";
    if (!title) {
      throw new Error("Task title is required");
    }
    normalized.title = title;
  }
  if ("notes" in patch) normalized.notes = patch.notes ?? null;
  if ("status" in patch) normalized.status = patch.status;
  if ("priority" in patch) normalized.priority = patch.priority;
  if ("dueAt" in patch) normalized.dueAt = patch.dueAt ?? null;
  if ("estimateMin" in patch) normalized.estimateMin = patch.estimateMin ?? null;
  if ("tags" in patch) normalized.tags = patch.tags ?? [];
  if ("completedAt" in patch) normalized.completedAt = patch.completedAt ?? null;
  return normalized;
}

function assertMatchingPayloadId(id: string | undefined, entityId: string) {
  if (id && id !== entityId) {
    throw new Error("Task payload id must match entity id");
  }
}

function parseCursor(cursor: string | null) {
  if (!cursor) return 0;
  const match = /^cursor-(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}

function formatCursor(version: number) {
  return `cursor-${version}`;
}
