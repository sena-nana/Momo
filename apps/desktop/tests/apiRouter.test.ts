import { describe, expect, it } from "vitest";
import {
  API_ROUTES,
  createApiRouter,
  createInMemorySyncStore,
  createInMemoryTaskRepository,
  createSyncApi,
  createTaskService,
} from "../../../apps/api/src";
import {
  createDeltaPushRequest,
  createListTaskConflictsRequest,
  createResolveTaskConflictRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";

describe("API route adapter skeleton", () => {
  it("exports a route manifest for every supported HTTP-like endpoint", () => {
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
    ]);
  });

  it("routes task create and list requests with actor headers", async () => {
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

  it("routes sync delta push and pull requests", async () => {
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

  it("returns structured errors for invalid JSON and forbidden actors", async () => {
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
      body: { error: "Invalid JSON body" },
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
      body: { error: "Actor cannot write tasks" },
    });
  });

  it("routes sync conflict resolution requests", async () => {
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

  it("maps missing conflict resolution requests to a 404", async () => {
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
      body: { error: "Conflict not found" },
    });
  });

  it("routes manual conflict resolution as an accepted pending decision", async () => {
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

  it("routes pending sync conflict list requests", async () => {
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
  });
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
