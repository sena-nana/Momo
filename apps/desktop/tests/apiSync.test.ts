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
});
