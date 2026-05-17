import { describe, expect, it } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  createAcknowledgeNotificationRequest,
  createDeltaPullRequest,
  createDeltaPushRequest,
  createListNotificationsRequest,
  createListSyncEventsRequest,
  createListTaskConflictsRequest,
  createResolveTaskConflictRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";
import {
  createInMemorySyncEventStore,
  createInMemoryNotificationStore,
  createNotificationApi,
  enqueueNotificationsFromSyncEvents,
  projectSyncEventToNotification,
  createInMemorySyncStore,
  createSyncApi,
  createSyncEventApi,
} from "../../../apps/api/src";

describe("API 同步服务骨架", () => {
  it("接受本地任务变更并通过 delta pull 暴露", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });
    const changes: LocalChangeDto[] = [
      {
        id: "change-1",
        entityType: "task",
        entityId: "task-1",
        action: "task.create",
        payload: {
          id: "task-1",
          title: "Write roadmap",
          notes: "Draft sync service",
          status: "active",
          priority: 2,
          dueAt: "2026-05-17T03:00:00.000Z",
          estimateMin: 45,
          tags: ["sync"],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T10:30:00.000Z",
          completedAt: null,
        },
        createdAt: "2026-05-16T10:31:00.000Z",
      },
    ];

    const pushResponse = await api.deltaPush(
      createDeltaPushRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        changes,
        now: new Date("2026-05-16T10:32:00.000Z"),
      }),
    );

    expect(pushResponse).toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      acceptedChangeIds: ["change-1"],
      rejectedChanges: [],
      conflicts: [],
      serverTime: "2026-05-16T12:00:00.000Z",
    });
    expect(pushResponse.serverCursor).toBe("cursor-1");

    const pullResponse = await api.deltaPull(
      createDeltaPullRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    );

    expect(pullResponse).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      tasks: [
        {
          id: "task-1",
          workspaceId: "local",
          title: "Write roadmap",
          notes: "Draft sync service",
          status: "active",
          priority: 2,
          dueAt: "2026-05-17T03:00:00.000Z",
          estimateMin: 45,
          tags: ["sync"],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T10:30:00.000Z",
          completedAt: null,
          version: 1,
        },
      ],
      deletedTaskIds: [],
      serverCursor: "cursor-1",
      serverTime: "2026-05-16T12:00:00.000Z",
    });
  });

  it("拒绝不支持的契约版本且不修改存储", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await expect(
      api.deltaPush({
        contractVersion: 999 as typeof SYNC_CONTRACT_VERSION,
        workspaceId: "local",
        deviceId: "desktop-1",
        changes: [],
        clientSentAt: "2026-05-16T10:32:00.000Z",
      }),
    ).rejects.toThrow("不支持的同步契约版本");

    await expect(
      api.deltaPull(
        createDeltaPullRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          sinceCursor: null,
        }),
      ),
    ).resolves.toMatchObject({
      tasks: [],
      deletedTaskIds: [],
      serverCursor: "cursor-0",
    });
  });

  it("以递增 cursor 应用 update、status 和 delete 变更", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    const createResponse = await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Initial task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );

    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            patch: {
              title: "Updated task",
              notes: "More detail",
              priority: 3,
              tags: ["deep"],
            },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.status",
          payload: {
            id: "task-1",
            status: "completed",
            completedAt: "2026-05-16T10:20:00.000Z",
            updatedAt: "2026-05-16T10:20:00.000Z",
          },
          createdAt: "2026-05-16T10:21:00.000Z",
        },
      ]),
    );

    await expect(
      api.deltaPull(
        createDeltaPullRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          sinceCursor: createResponse.serverCursor,
        }),
      ),
    ).resolves.toMatchObject({
      tasks: [
        {
          id: "task-1",
          title: "Updated task",
          notes: "More detail",
          status: "completed",
          priority: 3,
          tags: ["deep"],
          completedAt: "2026-05-16T10:20:00.000Z",
          updatedAt: "2026-05-16T10:20:00.000Z",
          version: 3,
        },
      ],
      deletedTaskIds: [],
      serverCursor: "cursor-3",
    });

    const statusCursor = "cursor-3";
    await api.deltaPush(
      push("local", [
        {
          id: "change-4",
          entityType: "task",
          entityId: "task-1",
          action: "task.delete",
          payload: { id: "task-1" },
          createdAt: "2026-05-16T10:31:00.000Z",
        },
      ]),
    );

    await expect(
      api.deltaPull(
        createDeltaPullRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          sinceCursor: statusCursor,
        }),
      ),
    ).resolves.toMatchObject({
      tasks: [],
      deletedTaskIds: ["task-1"],
      serverCursor: "cursor-4",
    });
  });

  it("将重复播放的本地 change id 视为幂等", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });
    const change = taskCreateChange("change-1", {
      id: "task-1",
      title: "One task",
      updatedAt: "2026-05-16T10:00:00.000Z",
    });

    await api.deltaPush(push("local", [change]));
    const replayResponse = await api.deltaPush(push("local", [change]));

    expect(replayResponse).toMatchObject({
      acceptedChangeIds: ["change-1"],
      rejectedChanges: [],
      serverCursor: "cursor-1",
    });
    await expect(
      api.deltaPull(
        createDeltaPullRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          sinceCursor: "cursor-1",
        }),
      ),
    ).resolves.toMatchObject({
      tasks: [],
      deletedTaskIds: [],
      serverCursor: "cursor-1",
    });
  });

  it("汇报被拒绝的变更且不推进 server cursor", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await expect(
      api.deltaPush(
        push("local", [
          {
            id: "change-bad",
            entityType: "task",
            entityId: "missing-task",
            action: "task.update",
            payload: {
              id: "missing-task",
              patch: { title: "Cannot update" },
              updatedAt: "2026-05-16T10:10:00.000Z",
            },
            createdAt: "2026-05-16T10:11:00.000Z",
          },
        ]),
      ),
    ).resolves.toMatchObject({
      acceptedChangeIds: [],
      rejectedChanges: [
        {
          id: "change-bad",
          reason: "应用此变更前任务必须存在",
        },
      ],
      serverCursor: "cursor-0",
    });
  });

  it("将过期 baseVersion 更新报告为冲突且不推进 cursor", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );

    await expect(
      api.deltaPush(
        push("local", [
          {
            id: "change-3",
            entityType: "task",
            entityId: "task-1",
            action: "task.update",
            payload: {
              id: "task-1",
              baseVersion: 1,
              patch: { title: "Stale local edit" },
              updatedAt: "2026-05-16T10:12:00.000Z",
            },
            createdAt: "2026-05-16T10:13:00.000Z",
          },
        ]),
      ),
    ).resolves.toMatchObject({
      acceptedChangeIds: [],
      rejectedChanges: [],
      conflicts: [
        {
          id: "conflict-change-3",
          workspaceId: "local",
          taskId: "task-1",
          changeId: "change-3",
          reason: "任务版本冲突",
          clientPayload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Stale local edit" },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          serverTask: {
            id: "task-1",
            title: "Server-side edit",
            version: 2,
          },
          createdAt: "2026-05-16T12:00:00.000Z",
        },
      ],
      serverCursor: "cursor-2",
    });
  });

  it("使用 server_wins 策略解决已存储冲突", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Stale local edit" },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          createdAt: "2026-05-16T10:13:00.000Z",
        },
      ]),
    );

    await expect(
      api.resolveConflict(
        createResolveTaskConflictRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "server_wins",
          resolvedBy: "user-1",
          note: "Keep newer server task",
        }),
      ),
    ).resolves.toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      conflictId: "conflict-change-3",
      strategy: "server_wins",
      status: "resolved",
      resolvedTask: {
        id: "task-1",
        title: "Server-side edit",
        version: 2,
      },
      serverCursor: "cursor-2",
      serverTime: "2026-05-16T12:00:00.000Z",
    });
  });

  it("使用 client_wins 策略解决已存储冲突", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Client chosen edit", priority: 3 },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          createdAt: "2026-05-16T10:13:00.000Z",
        },
      ]),
    );

    await expect(
      api.resolveConflict(
        createResolveTaskConflictRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "client_wins",
          resolvedBy: "user-1",
          note: "Use local edit",
        }),
      ),
    ).resolves.toMatchObject({
      conflictId: "conflict-change-3",
      strategy: "client_wins",
      status: "resolved",
      resolvedTask: {
        id: "task-1",
        title: "Client chosen edit",
        priority: 3,
        version: 3,
      },
      serverCursor: "cursor-3",
    });
  });

  it("保持人工冲突解决待处理且不应用 client 变更", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Needs human review", priority: 3 },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          createdAt: "2026-05-16T10:13:00.000Z",
        },
      ]),
    );

    await expect(
      api.resolveConflict(
        createResolveTaskConflictRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "manual",
          resolvedBy: "user-1",
          note: "Review later",
        }),
      ),
    ).resolves.toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      conflictId: "conflict-change-3",
      strategy: "manual",
      status: "pending_manual",
      resolvedTask: null,
      serverCursor: "cursor-2",
      serverTime: "2026-05-16T12:00:00.000Z",
    });

    await expect(
      api.deltaPull(
        createDeltaPullRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          sinceCursor: "cursor-2",
        }),
      ),
    ).resolves.toMatchObject({
      tasks: [],
      deletedTaskIds: [],
      serverCursor: "cursor-2",
    });

    await expect(
      api.resolveConflict(
        createResolveTaskConflictRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "server_wins",
          resolvedBy: "user-1",
          note: "Human kept server version",
        }),
      ),
    ).resolves.toMatchObject({
      status: "resolved",
      resolvedTask: {
        id: "task-1",
        title: "Server-side edit",
        priority: 0,
        version: 2,
      },
      serverCursor: "cursor-2",
    });
  });

  it("仅列出 workspace 的未解决冲突", async () => {
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Pending local edit" },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          createdAt: "2026-05-16T10:13:00.000Z",
        },
      ]),
    );

    await expect(
      api.listConflicts(
        createListTaskConflictsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
        }),
      ),
    ).resolves.toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      conflicts: [
        {
          id: "conflict-change-3",
          taskId: "task-1",
          changeId: "change-3",
          clientPayload: {
            patch: { title: "Pending local edit" },
          },
          serverTask: {
            title: "Server-side edit",
            version: 2,
          },
        },
      ],
      serverCursor: "cursor-2",
      serverTime: "2026-05-16T12:00:00.000Z",
    });

    await api.resolveConflict(
      createResolveTaskConflictRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        conflictId: "conflict-change-3",
        strategy: "manual",
        resolvedBy: "user-1",
      }),
    );

    await expect(
      api.listConflicts(
        createListTaskConflictsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
        }),
      ),
    ).resolves.toMatchObject({
      conflicts: [{ id: "conflict-change-3" }],
      serverCursor: "cursor-2",
    });

    await api.resolveConflict(
      createResolveTaskConflictRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        conflictId: "conflict-change-3",
        strategy: "server_wins",
        resolvedBy: "user-1",
      }),
    );

    await expect(
      api.listConflicts(
        createListTaskConflictsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
        }),
      ),
    ).resolves.toMatchObject({
      conflicts: [],
      serverCursor: "cursor-2",
    });
  });

  it("发布实时同步事件并按 sequence 补拉", async () => {
    const eventApi = createSyncEventApi({
      store: createInMemorySyncEventStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    const first = await eventApi.publishEvent({
      workspaceId: "local",
      type: "task.changed",
      taskId: "task-1",
      changeId: "change-1",
      payload: { title: "First edit" },
    });
    const second = await eventApi.publishEvent({
      workspaceId: "local",
      type: "conflict.raised",
      taskId: "task-1",
      changeId: "change-2",
      conflictId: "conflict-change-2",
      payload: { reason: "任务版本冲突" },
    });

    expect(first).toMatchObject({
      id: "event-1",
      workspaceId: "local",
      sequence: 1,
      type: "task.changed",
      taskId: "task-1",
      changeId: "change-1",
      createdAt: "2026-05-16T12:00:00.000Z",
    });
    expect(second).toMatchObject({
      id: "event-2",
      sequence: 2,
      type: "conflict.raised",
      conflictId: "conflict-change-2",
    });

    await expect(
      eventApi.listEvents(
        createListSyncEventsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          afterSequence: 1,
          limit: 10,
        }),
      ),
    ).resolves.toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      events: [second],
      latestSequence: 2,
      serverTime: "2026-05-16T12:00:00.000Z",
    });
  });

  it("为已接受任务变更和已触发冲突发布实时事件", async () => {
    const eventApi = createSyncEventApi({
      store: createInMemorySyncEventStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });
    const api = createSyncApi({
      store: createInMemorySyncStore(),
      eventApi,
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.deltaPush(
      push("local", [
        taskCreateChange("change-1", {
          id: "task-1",
          title: "Original task",
          updatedAt: "2026-05-16T10:00:00.000Z",
        }),
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-2",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Server-side edit" },
            updatedAt: "2026-05-16T10:10:00.000Z",
          },
          createdAt: "2026-05-16T10:11:00.000Z",
        },
      ]),
    );
    await api.deltaPush(
      push("local", [
        {
          id: "change-3",
          entityType: "task",
          entityId: "task-1",
          action: "task.update",
          payload: {
            id: "task-1",
            baseVersion: 1,
            patch: { title: "Stale local edit" },
            updatedAt: "2026-05-16T10:12:00.000Z",
          },
          createdAt: "2026-05-16T10:13:00.000Z",
        },
        {
          id: "change-bad",
          entityType: "task",
          entityId: "missing-task",
          action: "task.update",
          payload: {
            id: "missing-task",
            patch: { title: "Cannot update" },
            updatedAt: "2026-05-16T10:14:00.000Z",
          },
          createdAt: "2026-05-16T10:15:00.000Z",
        },
      ]),
    );

    await expect(
      eventApi.listEvents(
        createListSyncEventsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          afterSequence: 0,
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      events: [
        {
          id: "event-1",
          type: "task.changed",
          taskId: "task-1",
          changeId: "change-1",
          payload: { action: "task.create" },
        },
        {
          id: "event-2",
          type: "task.changed",
          taskId: "task-1",
          changeId: "change-2",
          payload: { action: "task.update" },
        },
        {
          id: "event-3",
          type: "conflict.raised",
          taskId: "task-1",
          changeId: "change-3",
          conflictId: "conflict-change-3",
          payload: { reason: "任务版本冲突" },
        },
      ],
      latestSequence: 3,
    });
  });

  it("将本地通知入队并按 status 列出且不投递", async () => {
    const api = createNotificationApi({
      store: createInMemoryNotificationStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    const notification = await api.enqueueNotification({
      workspaceId: "local",
      type: "conflict.raised",
      title: "同步冲突需要处理",
      body: "任务在两处发生变更",
      sourceEventId: "event-3",
      taskId: "task-1",
      changeId: "change-3",
      conflictId: "conflict-change-3",
      payload: { reason: "任务版本冲突" },
    });

    expect(notification).toMatchObject({
      id: "notification-1",
      workspaceId: "local",
      type: "conflict.raised",
      status: "queued",
      title: "同步冲突需要处理",
      body: "任务在两处发生变更",
      sourceEventId: "event-3",
      conflictId: "conflict-change-3",
      payload: { reason: "任务版本冲突" },
      createdAt: "2026-05-16T12:00:00.000Z",
      acknowledgedAt: null,
    });

    await api.enqueueNotification({
      workspaceId: "local",
      type: "sync.run.failed",
      title: "同步失败",
      body: "网络不可用",
      sourceEventId: null,
      payload: { message: "离线" },
    });

    await expect(
      api.listNotifications(
        createListNotificationsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          status: "queued",
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      notifications: [
        { id: "notification-1", type: "conflict.raised", status: "queued" },
        { id: "notification-2", type: "sync.run.failed", status: "queued" },
      ],
      serverTime: "2026-05-16T12:00:00.000Z",
    });
  });

  it("确认队列中的通知但不删除也不投递消息", async () => {
    const api = createNotificationApi({
      store: createInMemoryNotificationStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await api.enqueueNotification({
      workspaceId: "local",
      type: "approval.required",
      title: "需要人工批准",
      body: null,
      sourceEventId: null,
      payload: { runId: "run-1" },
    });

    await expect(
      api.acknowledgeNotification(
        createAcknowledgeNotificationRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          notificationId: "notification-1",
          acknowledgedBy: "user-1",
        }),
      ),
    ).resolves.toMatchObject({
      contractVersion: SYNC_CONTRACT_VERSION,
      notification: {
        id: "notification-1",
        status: "acknowledged",
        acknowledgedAt: "2026-05-16T12:00:00.000Z",
      },
      serverTime: "2026-05-16T12:00:00.000Z",
    });

    await expect(
      api.listNotifications(
        createListNotificationsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          status: "queued",
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      notifications: [],
    });

    await expect(
      api.listNotifications(
        createListNotificationsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          status: "acknowledged",
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      notifications: [
        {
          id: "notification-1",
          status: "acknowledged",
          acknowledgedAt: "2026-05-16T12:00:00.000Z",
        },
      ],
    });
  });

  it("将同步事件投影为本地通知队列输入且不投递", () => {
    expect(
      projectSyncEventToNotification({
        id: "event-3",
        workspaceId: "local",
        sequence: 3,
        type: "conflict.raised",
        taskId: "task-1",
        changeId: "change-3",
        conflictId: "conflict-change-3",
        payload: { reason: "任务版本冲突" },
        createdAt: "2026-05-16T12:00:00.000Z",
      }),
    ).toEqual({
      workspaceId: "local",
      type: "conflict.raised",
      title: "同步冲突需要处理",
      body: "任务版本冲突",
      sourceEventId: "event-3",
      taskId: "task-1",
      changeId: "change-3",
      conflictId: "conflict-change-3",
      payload: {
        eventType: "conflict.raised",
        eventSequence: 3,
        reason: "任务版本冲突",
      },
    });

    expect(
      projectSyncEventToNotification({
        id: "event-4",
        workspaceId: "local",
        sequence: 4,
        type: "sync.run.updated",
        payload: { status: "failed", message: "网络不可用" },
        createdAt: "2026-05-16T12:01:00.000Z",
      }),
    ).toEqual({
      workspaceId: "local",
      type: "sync.run.failed",
      title: "同步失败",
      body: "网络不可用",
      sourceEventId: "event-4",
      payload: {
        eventType: "sync.run.updated",
        eventSequence: 4,
        status: "failed",
        message: "网络不可用",
      },
    });

    expect(
      projectSyncEventToNotification({
        id: "event-5",
        workspaceId: "local",
        sequence: 5,
        type: "task.changed",
        taskId: "task-1",
        changeId: "change-5",
        payload: { action: "task.update" },
        createdAt: "2026-05-16T12:02:00.000Z",
      }),
    ).toBeNull();
  });

  it("通过本地队列 API 入队投影后的通知", async () => {
    const api = createNotificationApi({
      store: createInMemoryNotificationStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    const result = await enqueueNotificationsFromSyncEvents({
      notificationApi: api,
      events: [
        {
          id: "event-1",
          workspaceId: "local",
          sequence: 1,
          type: "task.changed",
          taskId: "task-1",
          changeId: "change-1",
          payload: { action: "task.update" },
          createdAt: "2026-05-16T11:59:00.000Z",
        },
        {
          id: "event-2",
          workspaceId: "local",
          sequence: 2,
          type: "conflict.raised",
          taskId: "task-1",
          changeId: "change-2",
          conflictId: "conflict-change-2",
          payload: { reason: "任务版本冲突" },
          createdAt: "2026-05-16T12:00:00.000Z",
        },
      ],
    });

    expect(result).toMatchObject({
      enqueuedCount: 1,
      ignoredCount: 1,
      notifications: [
        {
          id: "notification-1",
          type: "conflict.raised",
          status: "queued",
          sourceEventId: "event-2",
          conflictId: "conflict-change-2",
        },
      ],
    });

    await expect(
      api.listNotifications(
        createListNotificationsRequest({
          workspaceId: "local",
          deviceId: "desktop-1",
          status: "queued",
          limit: 10,
        }),
      ),
    ).resolves.toMatchObject({
      notifications: [
        {
          id: "notification-1",
          type: "conflict.raised",
          sourceEventId: "event-2",
        },
      ],
    });
  });
});

function push(workspaceId: string, changes: LocalChangeDto[]) {
  return createDeltaPushRequest({
    workspaceId,
    deviceId: "desktop-1",
    changes,
    now: new Date("2026-05-16T10:32:00.000Z"),
  });
}

function taskCreateChange(
  id: string,
  overrides: {
    id: string;
    title: string;
    updatedAt: string;
  },
): LocalChangeDto {
  return {
    id,
    entityType: "task",
    entityId: overrides.id,
    action: "task.create",
    payload: {
      id: overrides.id,
      title: overrides.title,
      notes: null,
      status: "active",
      priority: 0,
      dueAt: null,
      estimateMin: null,
      tags: [],
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: overrides.updatedAt,
      completedAt: null,
    },
    createdAt: overrides.updatedAt,
  };
}
