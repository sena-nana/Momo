import { describe, expect, it } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  createDeltaPullRequest,
  createDeltaPushRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";
import { createInMemorySyncStore, createSyncApi } from "../../../apps/api/src";

describe("API sync service skeleton", () => {
  it("accepts local task changes and exposes them through delta pull", async () => {
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

  it("rejects unsupported contract versions without mutating the store", async () => {
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
    ).rejects.toThrow("Unsupported sync contract version");

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

  it("applies update, status, and delete changes with incremental cursors", async () => {
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

  it("treats replayed local change ids as idempotent", async () => {
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

  it("reports rejected changes without advancing the server cursor", async () => {
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
          reason: "Task must exist before applying this change",
        },
      ],
      serverCursor: "cursor-0",
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
