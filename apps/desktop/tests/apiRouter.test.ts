import { describe, expect, it } from "vitest";
import {
  createApiRouter,
  createInMemorySyncStore,
  createInMemoryTaskRepository,
  createSyncApi,
  createTaskService,
} from "../../../apps/api/src";
import {
  createDeltaPushRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";

describe("API route adapter skeleton", () => {
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
