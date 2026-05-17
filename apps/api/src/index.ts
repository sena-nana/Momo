import {
  SYNC_CONTRACT_VERSION,
  createNotification,
  createSyncEvent,
  createTaskConflict,
  type AcknowledgeNotificationRequest,
  type AcknowledgeNotificationResponse,
  type DeltaPullRequest,
  type DeltaPullResponse,
  type DeltaPushRequest,
  type DeltaPushResponse,
  type ListNotificationsRequest,
  type ListNotificationsResponse,
  type ListSyncEventsRequest,
  type ListSyncEventsResponse,
  type ListTaskConflictsRequest,
  type ListTaskConflictsResponse,
  type LocalChangeDto,
  type NotificationDto,
  type NotificationListStatusDto,
  type NotificationTypeDto,
  type ResolveTaskConflictRequest,
  type ResolveTaskConflictResponse,
  type SyncEventDto,
  type SyncEventTypeDto,
  type TaskConflictDto,
  type TaskDto,
  type TaskStatusDto,
} from "../../../packages/contracts/src";

export * from "./tasks";
export * from "./router";

export interface SyncApi {
  deltaPush(request: DeltaPushRequest): Promise<DeltaPushResponse>;
  deltaPull(request: DeltaPullRequest): Promise<DeltaPullResponse>;
  listConflicts(
    request: ListTaskConflictsRequest,
  ): Promise<ListTaskConflictsResponse>;
  resolveConflict(
    request: ResolveTaskConflictRequest,
  ): Promise<ResolveTaskConflictResponse>;
}

export interface SyncEventApi {
  publishEvent(input: PublishSyncEventInput): Promise<SyncEventDto>;
  listEvents(request: ListSyncEventsRequest): Promise<ListSyncEventsResponse>;
}

export interface NotificationApi {
  enqueueNotification(input: EnqueueNotificationInput): Promise<NotificationDto>;
  listNotifications(
    request: ListNotificationsRequest,
  ): Promise<ListNotificationsResponse>;
  acknowledgeNotification(
    request: AcknowledgeNotificationRequest,
  ): Promise<AcknowledgeNotificationResponse>;
}

export interface EnqueueNotificationsFromSyncEventsResult {
  enqueuedCount: number;
  ignoredCount: number;
  notifications: NotificationDto[];
}

export interface PublishSyncEventInput {
  workspaceId: string;
  type: SyncEventTypeDto;
  taskId?: string;
  changeId?: string;
  conflictId?: string;
  payload: unknown;
}

export interface EnqueueNotificationInput {
  workspaceId: string;
  type: NotificationTypeDto;
  title: string;
  body?: string | null;
  sourceEventId?: string | null;
  taskId?: string;
  changeId?: string;
  conflictId?: string;
  payload: unknown;
}

export interface SyncEventStore {
  publish(input: PublishSyncEventInput, now: Date): Promise<SyncEventDto>;
  list(
    workspaceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<SyncEventSnapshot>;
}

export interface SyncEventSnapshot {
  events: SyncEventDto[];
  latestSequence: number;
}

export interface NotificationStore {
  enqueue(input: EnqueueNotificationInput, now: Date): Promise<NotificationDto>;
  list(
    workspaceId: string,
    status: NotificationListStatusDto,
    limit: number,
  ): Promise<NotificationDto[]>;
  acknowledge(
    workspaceId: string,
    notificationId: string,
    now: Date,
  ): Promise<NotificationDto>;
}

export interface SyncStore {
  applyChange(
    workspaceId: string,
    change: LocalChangeDto,
    now: Date,
  ): Promise<ApplyChangeResult>;
  listChanges(workspaceId: string, sinceCursor: string | null): Promise<SyncSnapshot>;
  listConflicts(workspaceId: string): Promise<TaskConflictDto[]>;
  currentCursor(workspaceId: string): Promise<string>;
  resolveConflict(
    workspaceId: string,
    request: ResolveTaskConflictRequest,
  ): Promise<ConflictResolutionResult>;
}

export interface ApplyChangeResult {
  conflict?: TaskConflictDto;
  applied?: boolean;
}

export interface ConflictResolutionResult {
  status: ResolveTaskConflictResponse["status"];
  strategy: ResolveTaskConflictRequest["strategy"];
  resolvedTask: TaskDto | null;
}

export interface SyncSnapshot {
  cursor: string;
  tasks: TaskDto[];
  deletedTaskIds: string[];
}

interface SyncApiOptions {
  store: SyncStore;
  eventApi?: SyncEventApi;
  now?: () => Date;
}

interface StoredWorkspace {
  version: number;
  tasks: Map<string, TaskDto>;
  deletedTaskIds: Set<string>;
  taskVersions: Map<string, number>;
  deleteVersions: Map<string, number>;
  appliedChangeIds: Set<string>;
  conflicts: Map<string, TaskConflictDto>;
}

interface StoredEventWorkspace {
  nextSequence: number;
  events: SyncEventDto[];
}

interface StoredNotificationWorkspace {
  nextId: number;
  notifications: NotificationDto[];
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

export function createSyncApi({
  store,
  eventApi,
  now = () => new Date(),
}: SyncApiOptions): SyncApi {
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
            await publishConflictRaisedEvent(eventApi, result.conflict);
          } else {
            acceptedChangeIds.push(change.id);
            if (result.applied !== false) {
              await publishTaskChangedEvent(eventApi, request.workspaceId, change);
            }
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

    async listConflicts(request) {
      assertSupportedContract(request.contractVersion);

      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        conflicts: await store.listConflicts(request.workspaceId),
        serverCursor: await store.currentCursor(request.workspaceId),
        serverTime: now().toISOString(),
      };
    },

    async resolveConflict(request) {
      assertSupportedContract(request.contractVersion);
      const result = await store.resolveConflict(request.workspaceId, request);

      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        conflictId: request.conflictId,
        strategy: result.strategy,
        status: result.status,
        resolvedTask: result.resolvedTask,
        serverCursor: await store.currentCursor(request.workspaceId),
        serverTime: now().toISOString(),
      };
    },
  };
}

export function createSyncEventApi({
  store,
  now = () => new Date(),
}: {
  store: SyncEventStore;
  now?: () => Date;
}): SyncEventApi {
  return {
    async publishEvent(input) {
      return store.publish(input, now());
    },

    async listEvents(request) {
      assertSupportedContract(request.contractVersion);
      const snapshot = await store.list(
        request.workspaceId,
        request.afterSequence,
        request.limit,
      );

      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        events: snapshot.events,
        latestSequence: snapshot.latestSequence,
        serverTime: now().toISOString(),
      };
    },
  };
}

export function createNotificationApi({
  store,
  now = () => new Date(),
}: {
  store: NotificationStore;
  now?: () => Date;
}): NotificationApi {
  return {
    async enqueueNotification(input) {
      return store.enqueue(input, now());
    },

    async listNotifications(request) {
      assertSupportedContract(request.contractVersion);
      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        notifications: await store.list(
          request.workspaceId,
          request.status,
          request.limit,
        ),
        serverTime: now().toISOString(),
      };
    },

    async acknowledgeNotification(request) {
      assertSupportedContract(request.contractVersion);
      return {
        contractVersion: SYNC_CONTRACT_VERSION,
        notification: await store.acknowledge(
          request.workspaceId,
          request.notificationId,
          now(),
        ),
        serverTime: now().toISOString(),
      };
    },
  };
}

export function projectSyncEventToNotification(
  event: SyncEventDto,
): EnqueueNotificationInput | null {
  if (event.type === "conflict.raised") {
    const reason = readStringPayloadField(event.payload, "reason");
    return {
      workspaceId: event.workspaceId,
      type: "conflict.raised",
      title: "Sync conflict needs review",
      body: reason,
      sourceEventId: event.id,
      taskId: event.taskId,
      changeId: event.changeId,
      conflictId: event.conflictId,
      payload: {
        eventType: event.type,
        eventSequence: event.sequence,
        reason,
      },
    };
  }

  if (event.type === "sync.run.updated") {
    const status = readStringPayloadField(event.payload, "status");
    if (status !== "failed") return null;
    const message = readStringPayloadField(event.payload, "message");
    return {
      workspaceId: event.workspaceId,
      type: "sync.run.failed",
      title: "Sync failed",
      body: message,
      sourceEventId: event.id,
      payload: {
        eventType: event.type,
        eventSequence: event.sequence,
        status,
        message,
      },
    };
  }

  return null;
}

export async function enqueueNotificationsFromSyncEvents({
  notificationApi,
  events,
}: {
  notificationApi: NotificationApi;
  events: SyncEventDto[];
}): Promise<EnqueueNotificationsFromSyncEventsResult> {
  const notifications: NotificationDto[] = [];
  let ignoredCount = 0;

  for (const event of events) {
    const input = projectSyncEventToNotification(event);
    if (!input) {
      ignoredCount += 1;
      continue;
    }
    notifications.push(await notificationApi.enqueueNotification(input));
  }

  return {
    enqueuedCount: notifications.length,
    ignoredCount,
    notifications,
  };
}

export function createInMemorySyncEventStore(): SyncEventStore {
  const workspaces = new Map<string, StoredEventWorkspace>();

  function workspaceFor(workspaceId: string) {
    let workspace = workspaces.get(workspaceId);
    if (!workspace) {
      workspace = {
        nextSequence: 1,
        events: [],
      };
      workspaces.set(workspaceId, workspace);
    }
    return workspace;
  }

  return {
    async publish(input, currentTime) {
      const workspace = workspaceFor(input.workspaceId);
      const sequence = workspace.nextSequence;
      const event = createSyncEvent({
        id: `event-${sequence}`,
        workspaceId: input.workspaceId,
        sequence,
        type: input.type,
        taskId: input.taskId,
        changeId: input.changeId,
        conflictId: input.conflictId,
        payload: input.payload,
        now: currentTime,
      });

      workspace.nextSequence += 1;
      workspace.events.push(event);
      return event;
    },

    async list(workspaceId, afterSequence, limit) {
      const workspace = workspaceFor(workspaceId);
      const safeLimit = Math.max(0, limit);

      return {
        events: workspace.events
          .filter((event) => event.sequence > afterSequence)
          .slice(0, safeLimit),
        latestSequence: workspace.nextSequence - 1,
      };
    },
  };
}

export function createInMemoryNotificationStore(): NotificationStore {
  const workspaces = new Map<string, StoredNotificationWorkspace>();

  function workspaceFor(workspaceId: string) {
    let workspace = workspaces.get(workspaceId);
    if (!workspace) {
      workspace = {
        nextId: 1,
        notifications: [],
      };
      workspaces.set(workspaceId, workspace);
    }
    return workspace;
  }

  return {
    async enqueue(input, currentTime) {
      const workspace = workspaceFor(input.workspaceId);
      const id = `notification-${workspace.nextId}`;
      const notification = createNotification({
        id,
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title,
        body: input.body,
        sourceEventId: input.sourceEventId,
        taskId: input.taskId,
        changeId: input.changeId,
        conflictId: input.conflictId,
        payload: input.payload,
        now: currentTime,
      });

      workspace.nextId += 1;
      workspace.notifications.push(notification);
      return notification;
    },

    async list(workspaceId, status, limit) {
      const safeLimit = Math.max(0, limit);
      return workspaceFor(workspaceId).notifications
        .filter((notification) => {
          if (status === "all") return true;
          return notification.status === status;
        })
        .slice(0, safeLimit);
    },

    async acknowledge(workspaceId, notificationId, currentTime) {
      const workspace = workspaceFor(workspaceId);
      const index = workspace.notifications.findIndex(
        (notification) => notification.id === notificationId,
      );
      if (index < 0) {
        throw new Error("Notification not found");
      }

      const notification = {
        ...workspace.notifications[index],
        status: "acknowledged" as const,
        acknowledgedAt: currentTime.toISOString(),
      };
      workspace.notifications[index] = notification;
      return notification;
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
        conflicts: new Map(),
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
        return { applied: false };
      }

      if (change.action === "task.delete") {
        const version = workspace.version + 1;
        workspace.version = version;
        workspace.tasks.delete(change.entityId);
        workspace.deletedTaskIds.add(change.entityId);
        workspace.deleteVersions.set(change.entityId, version);
        workspace.appliedChangeIds.add(change.id);
        return { applied: true };
      }

      const existing = workspace.tasks.get(change.entityId);
      const conflict = detectVersionConflict({
        workspaceId,
        change,
        existing,
        now: currentTime,
      });
      if (conflict) {
        workspace.conflicts.set(conflict.id, conflict);
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
      return { applied: true };
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

    async listConflicts(workspaceId) {
      return [...workspaceFor(workspaceId).conflicts.values()];
    },

    async resolveConflict(workspaceId, request) {
      const workspace = workspaceFor(workspaceId);
      const conflict = workspace.conflicts.get(request.conflictId);
      if (!conflict) {
        throw new Error("Conflict not found");
      }

      if (request.strategy === "server_wins") {
        workspace.conflicts.delete(request.conflictId);
        return {
          status: "resolved",
          strategy: request.strategy,
          resolvedTask: conflict.serverTask,
        };
      }

      if (request.strategy === "client_wins") {
        const existing = conflict.serverTask ?? workspace.tasks.get(conflict.taskId);
        if (!existing) {
          throw new Error("Task not found");
        }
        const version = workspace.version + 1;
        const task = applyClientConflictPayload({
          workspaceId,
          taskId: conflict.taskId,
          payload: conflict.clientPayload,
          existing,
          version,
        });

        workspace.version = version;
        workspace.tasks.set(conflict.taskId, task);
        workspace.taskVersions.set(conflict.taskId, version);
        workspace.appliedChangeIds.add(conflict.changeId);
        workspace.conflicts.delete(request.conflictId);
        return {
          status: "resolved",
          strategy: request.strategy,
          resolvedTask: task,
        };
      }

      return {
        status: "pending_manual",
        strategy: request.strategy,
        resolvedTask: null,
      };
    },
  };
}

function assertSupportedContract(contractVersion: number) {
  if (contractVersion !== SYNC_CONTRACT_VERSION) {
    throw new Error("Unsupported sync contract version");
  }
}

function readStringPayloadField(payload: unknown, field: string) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

async function publishTaskChangedEvent(
  eventApi: SyncEventApi | undefined,
  workspaceId: string,
  change: LocalChangeDto,
) {
  if (!eventApi) return;
  await eventApi.publishEvent({
    workspaceId,
    type: "task.changed",
    taskId: change.entityId,
    changeId: change.id,
    payload: {
      action: change.action,
    },
  });
}

async function publishConflictRaisedEvent(
  eventApi: SyncEventApi | undefined,
  conflict: TaskConflictDto,
) {
  if (!eventApi) return;
  await eventApi.publishEvent({
    workspaceId: conflict.workspaceId,
    type: "conflict.raised",
    taskId: conflict.taskId,
    changeId: conflict.changeId,
    conflictId: conflict.id,
    payload: {
      reason: conflict.reason,
    },
  });
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

function applyClientConflictPayload(input: {
  workspaceId: string;
  taskId: string;
  payload: unknown;
  existing: TaskDto;
  version: number;
}) {
  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("Task conflict payload must be an object");
  }

  if ("patch" in input.payload) {
    const payload = normalizeTaskUpdatePayload(input.payload, input.taskId);
    return {
      ...input.existing,
      ...payload.patch,
      id: input.taskId,
      workspaceId: input.workspaceId,
      updatedAt: payload.updatedAt,
      version: input.version,
    };
  }

  if ("status" in input.payload) {
    const payload = normalizeTaskStatusPayload(input.payload, input.taskId);
    return {
      ...input.existing,
      id: input.taskId,
      workspaceId: input.workspaceId,
      status: payload.status,
      completedAt: payload.completedAt,
      updatedAt: payload.updatedAt,
      version: input.version,
    };
  }

  throw new Error("Unsupported conflict payload");
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
