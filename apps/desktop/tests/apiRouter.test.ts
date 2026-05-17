import { describe, expect, it } from "vitest";
import {
  API_ROUTES,
  createApiRouter,
  createInMemoryNotificationStore,
  createInMemorySyncStore,
  createInMemorySyncEventStore,
  createInMemoryTaskRepository,
  createNotificationApi,
  createSyncApi,
  createSyncEventApi,
  createTaskService,
} from "../../../apps/api/src";
import {
  createAcknowledgeNotificationRequest,
  createDeltaPushRequest,
  createListNotificationsRequest,
  createListSyncEventsRequest,
  createListTaskConflictsRequest,
  createResolveTaskConflictRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";

describe("API 路由适配器骨架", () => {
  it("导出所有支持的 HTTP-like endpoint 路由清单", () => {
    expect(API_ROUTES.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /tasks",
      "POST /tasks",
      "PATCH /tasks/:id",
      "POST /tasks/:id/status",
      "DELETE /tasks/:id",
      "POST /sync/delta/push",
      "POST /sync/delta/pull",
      "GET /sync/conflicts",
      "POST /sync/conflicts/resolve",
      "GET /sync/events",
      "GET /notifications",
      "POST /notifications/:id/ack",
    ]);
  });

  it("使用 actor headers 分派任务创建和列表请求", async () => {
    const router = createRouter();

    const createResponse = await router.handle({
      method: "POST",
      path: "/tasks",
      headers: actorHeaders("workspace-a", "member"),
      body: { title: "  Routed task  " },
    });

    expect(createResponse).toMatchObject({
      status: 201,
      body: {
        task: {
          id: "task-1",
          workspaceId: "workspace-a",
          title: "Routed task",
          version: 1,
        },
      },
    });

    await expect(
      router.handle({
        method: "GET",
        path: "/tasks",
        headers: actorHeaders("workspace-a", "member"),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        tasks: [
          {
            id: "task-1",
            title: "Routed task",
          },
        ],
      },
    });
  });

  it("分派同步 delta push 和 pull 请求", async () => {
    const router = createRouter();
    const change: LocalChangeDto = {
      id: "change-1",
      entityType: "task",
      entityId: "task-1",
      action: "task.create",
      payload: {
        id: "task-1",
        title: "Sync route",
        notes: null,
        status: "active",
        priority: 0,
        dueAt: null,
        estimateMin: null,
        tags: [],
        createdAt: "2026-05-16T09:00:00.000Z",
        updatedAt: "2026-05-16T09:00:00.000Z",
        completedAt: null,
      },
      createdAt: "2026-05-16T09:00:00.000Z",
    };

    await expect(
      router.handle({
        method: "POST",
        path: "/sync/delta/push",
        body: createDeltaPushRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          changes: [change],
          now: new Date("2026-05-16T09:01:00.000Z"),
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        acceptedChangeIds: ["change-1"],
        serverCursor: "cursor-1",
      },
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/sync/delta/pull",
        body: {
          contractVersion: 1,
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          sinceCursor: null,
        },
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        tasks: [{ id: "task-1", title: "Sync route" }],
        serverCursor: "cursor-1",
      },
    });
  });

  it("为无效 JSON 和禁止写入的 actor 返回结构化错误", async () => {
    const router = createRouter();

    await expect(
      router.handle({
        method: "POST",
        path: "/tasks",
        headers: actorHeaders("workspace-a", "member"),
        body: "{not-json",
      }),
    ).resolves.toEqual({
      status: 400,
      body: { error: "JSON 请求体无效" },
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/tasks",
        headers: actorHeaders("workspace-a", "viewer"),
        body: { title: "No write" },
      }),
    ).resolves.toEqual({
      status: 403,
      body: { error: "当前操作者不能写入任务" },
    });
  });

  it("分派同步冲突解决请求", async () => {
    const router = createRouter();
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskCreateChange("change-1", "Original task", 0)],
        now: new Date("2026-05-16T09:01:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-2", "Server task", 1)],
        now: new Date("2026-05-16T09:02:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-3", "Stale task", 1)],
        now: new Date("2026-05-16T09:03:00.000Z"),
      }),
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/sync/conflicts/resolve",
        body: createResolveTaskConflictRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "server_wins",
          resolvedBy: "user-1",
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        conflictId: "conflict-change-3",
        status: "resolved",
        resolvedTask: {
          id: "task-1",
          title: "Server task",
        },
      },
    });
  });

  it("把不存在的冲突解决请求映射为 404", async () => {
    const router = createRouter();

    await expect(
      router.handle({
        method: "POST",
        path: "/sync/conflicts/resolve",
        body: createResolveTaskConflictRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          conflictId: "missing-conflict",
          strategy: "server_wins",
          resolvedBy: "user-1",
        }),
      }),
    ).resolves.toEqual({
      status: 404,
      body: { error: "冲突不存在" },
    });
  });

  it("把人工冲突解决分派为已接受的待处理决策", async () => {
    const router = createRouter();
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskCreateChange("change-1", "Original task", 0)],
        now: new Date("2026-05-16T09:01:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-2", "Server task", 1)],
        now: new Date("2026-05-16T09:02:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-3", "Stale task", 1)],
        now: new Date("2026-05-16T09:03:00.000Z"),
      }),
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/sync/conflicts/resolve",
        body: createResolveTaskConflictRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          conflictId: "conflict-change-3",
          strategy: "manual",
          resolvedBy: "user-1",
          note: "Needs visual merge",
        }),
      }),
    ).resolves.toMatchObject({
      status: 202,
      body: {
        conflictId: "conflict-change-3",
        strategy: "manual",
        status: "pending_manual",
        resolvedTask: null,
        serverCursor: "cursor-2",
      },
    });
  });

  it("分派待处理同步冲突列表请求", async () => {
    const router = createRouter();
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskCreateChange("change-1", "Original task", 0)],
        now: new Date("2026-05-16T09:01:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-2", "Server task", 1)],
        now: new Date("2026-05-16T09:02:00.000Z"),
      }),
    });
    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskUpdateChange("change-3", "Stale task", 1)],
        now: new Date("2026-05-16T09:03:00.000Z"),
      }),
    });

    await expect(
      router.handle({
        method: "GET",
        path: "/sync/conflicts",
        body: createListTaskConflictsRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        conflicts: [
          {
            id: "conflict-change-3",
            taskId: "task-1",
            serverTask: {
              title: "Server task",
            },
          },
        ],
        serverCursor: "cursor-2",
      },
    });
  });

  it("分派实时同步事件补拉请求且不打开 WebSocket", async () => {
    const router = createRouter();

    await expect(
      router.handle({
        method: "GET",
        path: "/sync/events",
        body: createListSyncEventsRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          afterSequence: 0,
          limit: 10,
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        events: [
          {
            id: "event-1",
            workspaceId: "workspace-a",
            sequence: 1,
            type: "task.changed",
          },
        ],
        latestSequence: 1,
      },
    });
  });

  it("通过补拉 endpoint 分派同步生成的实时事件", async () => {
    const eventApi = createSyncEventApi({
      store: createInMemorySyncEventStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });
    const router = createApiRouter({
      taskService: createTaskService({
        repository: createInMemoryTaskRepository(),
        now: () => new Date("2026-05-16T12:00:00.000Z"),
        id: () => "task-1",
      }),
      syncApi: createSyncApi({
        store: createInMemorySyncStore(),
        eventApi,
        now: () => new Date("2026-05-16T12:00:00.000Z"),
      }),
      syncEventApi: eventApi,
    });

    await router.handle({
      method: "POST",
      path: "/sync/delta/push",
      body: createDeltaPushRequest({
        workspaceId: "workspace-a",
        deviceId: "desktop-1",
        changes: [taskCreateChange("change-1", "Evented task", 0)],
        now: new Date("2026-05-16T11:00:00.000Z"),
      }),
    });

    await expect(
      router.handle({
        method: "GET",
        path: "/sync/events",
        body: createListSyncEventsRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          afterSequence: 0,
          limit: 10,
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        events: [
          {
            type: "task.changed",
            taskId: "task-1",
            changeId: "change-1",
            payload: { action: "task.create" },
          },
        ],
        latestSequence: 1,
      },
    });
  });

  it("分派本地通知列表和确认请求", async () => {
    const router = createRouter();

    await expect(
      router.handle({
        method: "GET",
        path: "/notifications",
        body: createListNotificationsRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          status: "queued",
          limit: 10,
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        notifications: [
          {
            id: "notification-1",
            workspaceId: "workspace-a",
            type: "conflict.raised",
            status: "queued",
            title: "同步冲突需要处理",
          },
        ],
      },
    });

    await expect(
      router.handle({
        method: "POST",
        path: "/notifications/notification-1/ack",
        body: createAcknowledgeNotificationRequest({
          workspaceId: "workspace-a",
          deviceId: "desktop-1",
          notificationId: "notification-1",
          acknowledgedBy: "user-1",
        }),
      }),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        notification: {
          id: "notification-1",
          status: "acknowledged",
          acknowledgedAt: "2026-05-16T12:00:00.000Z",
        },
      },
    });
  });
});

function createRouter() {
  return createApiRouter({
    taskService: createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    }),
    syncApi: createSyncApi({
      store: createInMemorySyncStore(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    }),
    syncEventApi: seededSyncEventApi(),
    notificationApi: seededNotificationApi(),
  });
}

function seededSyncEventApi() {
  const eventApi = createSyncEventApi({
    store: createInMemorySyncEventStore(),
    now: () => new Date("2026-05-16T12:00:00.000Z"),
  });
  void eventApi.publishEvent({
    workspaceId: "workspace-a",
    type: "task.changed",
    taskId: "task-1",
    changeId: "change-1",
    payload: { title: "Seeded event" },
  });
  return eventApi;
}

function seededNotificationApi() {
  const notificationApi = createNotificationApi({
    store: createInMemoryNotificationStore(),
    now: () => new Date("2026-05-16T12:00:00.000Z"),
  });
  void notificationApi.enqueueNotification({
    workspaceId: "workspace-a",
    type: "conflict.raised",
    title: "同步冲突需要处理",
    body: "任务在两处发生变更",
    sourceEventId: "event-3",
    taskId: "task-1",
    changeId: "change-3",
    conflictId: "conflict-change-3",
    payload: { reason: "任务版本冲突" },
  });
  return notificationApi;
}

function actorHeaders(workspaceId: string, role: string) {
  return {
    "x-workspace-id": workspaceId,
    "x-user-id": "user-1",
    "x-role": role,
  };
}

function taskCreateChange(
  id: string,
  title: string,
  baseVersion: number,
): LocalChangeDto {
  return {
    id,
    entityType: "task",
    entityId: "task-1",
    action: "task.create",
    payload: {
      id: "task-1",
      title,
      notes: null,
      status: "active",
      priority: 0,
      dueAt: null,
      estimateMin: null,
      tags: [],
      createdAt: "2026-05-16T09:00:00.000Z",
      updatedAt: "2026-05-16T09:00:00.000Z",
      completedAt: null,
      baseVersion,
    },
    createdAt: "2026-05-16T09:00:00.000Z",
  };
}

function taskUpdateChange(
  id: string,
  title: string,
  baseVersion: number,
): LocalChangeDto {
  return {
    id,
    entityType: "task",
    entityId: "task-1",
    action: "task.update",
    payload: {
      id: "task-1",
      baseVersion,
      patch: { title },
      updatedAt: "2026-05-16T09:10:00.000Z",
    },
    createdAt: "2026-05-16T09:10:00.000Z",
  };
}
