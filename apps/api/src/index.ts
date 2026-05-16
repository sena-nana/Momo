import {
  SYNC_CONTRACT_VERSION,
  type DeltaPullRequest,
  type DeltaPullResponse,
  type DeltaPushRequest,
  type DeltaPushResponse,
  type LocalChangeDto,
  type TaskDto,
  type TaskStatusDto,
} from "../../../packages/contracts/src";

export interface SyncApi {
  deltaPush(request: DeltaPushRequest): Promise<DeltaPushResponse>;
  deltaPull(request: DeltaPullRequest): Promise<DeltaPullResponse>;
}

export interface SyncStore {
  applyChange(workspaceId: string, change: LocalChangeDto): Promise<void>;
  listChanges(workspaceId: string, sinceCursor: string | null): Promise<SyncSnapshot>;
  currentCursor(workspaceId: string): Promise<string>;
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

export function createSyncApi({ store, now = () => new Date() }: SyncApiOptions): SyncApi {
  return {
    async deltaPush(request) {
      assertSupportedContract(request.contractVersion);
      const acceptedChangeIds: string[] = [];
      const rejectedChanges: DeltaPushResponse["rejectedChanges"] = [];

      for (const change of request.changes) {
        try {
          await store.applyChange(request.workspaceId, change);
          acceptedChangeIds.push(change.id);
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
      };
      workspaces.set(workspaceId, workspace);
    }
    return workspace;
  }

  function bump(workspace: StoredWorkspace) {
    workspace.version += 1;
    return workspace.version;
  }

  return {
    async applyChange(workspaceId, change) {
      const workspace = workspaceFor(workspaceId);

      if (change.entityType !== "task") {
        throw new Error("Unsupported entity type");
      }

      if (change.action === "task.delete") {
        const version = bump(workspace);
        workspace.tasks.delete(change.entityId);
        workspace.deletedTaskIds.add(change.entityId);
        workspace.deleteVersions.set(change.entityId, version);
        return;
      }

      const payload = normalizeTaskPayload(change.payload, change.entityId);
      const existing = workspace.tasks.get(change.entityId);
      const version = bump(workspace);
      const task: TaskDto = {
        ...existing,
        ...payload,
        id: change.entityId,
        workspaceId,
        version,
      };

      workspace.tasks.set(change.entityId, task);
      workspace.taskVersions.set(change.entityId, version);
      workspace.deletedTaskIds.delete(change.entityId);
      workspace.deleteVersions.delete(change.entityId);
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

function parseCursor(cursor: string | null) {
  if (!cursor) return 0;
  const match = /^cursor-(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}

function formatCursor(version: number) {
  return `cursor-${version}`;
}
