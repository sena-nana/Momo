import { describe, expect, it, vi } from "vitest";
import { SYNC_CONTRACT_VERSION, type DeltaPushResponse } from "../../../packages/contracts/src";
import type { TaskRepository } from "../src/data/taskRepository";
import {
  applyDeltaPushResponse,
  buildDeltaPushFromPendingChanges,
} from "../src/sync/syncClient";

describe("desktop sync client adapter", () => {
  it("builds a delta push request from pending local changes", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: { title: "Sync me" },
          createdAt: "2026-05-16T10:00:00.000Z",
          syncedAt: null,
        },
      ]),
    } as unknown as TaskRepository;

    await expect(
      buildDeltaPushFromPendingChanges({
        repository,
        workspaceId: "local",
        deviceId: "desktop-1",
        now: new Date("2026-05-16T12:00:00.000Z"),
      }),
    ).resolves.toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      changes: [
        {
          id: "change-1",
          entityType: "task",
          entityId: "task-1",
          action: "task.create",
          payload: { title: "Sync me" },
          createdAt: "2026-05-16T10:00:00.000Z",
        },
      ],
      clientSentAt: "2026-05-16T12:00:00.000Z",
    });
  });

  it("builds an empty delta push request when there is nothing pending", async () => {
    const repository = {
      listPendingChanges: vi.fn().mockResolvedValue([]),
    } as unknown as TaskRepository;

    const request = await buildDeltaPushFromPendingChanges({
      repository,
      workspaceId: "local",
      deviceId: "desktop-1",
      now: new Date("2026-05-16T12:00:00.000Z"),
    });

    expect(request.changes).toEqual([]);
    expect(repository.listPendingChanges).toHaveBeenCalledTimes(1);
  });

  it("marks accepted changes as synced and returns unresolved sync results", async () => {
    const repository = {
      markChangeSynced: vi.fn().mockResolvedValue(undefined),
    } as unknown as TaskRepository;
    const response: DeltaPushResponse = {
      contractVersion: SYNC_CONTRACT_VERSION,
      acceptedChangeIds: ["change-1", "change-2"],
      rejectedChanges: [{ id: "change-3", reason: "Invalid payload" }],
      conflicts: [
        {
          id: "conflict-1",
          workspaceId: "local",
          taskId: "task-1",
          changeId: "change-4",
          reason: "Task version conflict",
          clientPayload: { title: "Local" },
          serverTask: null,
          createdAt: "2026-05-16T12:00:00.000Z",
        },
      ],
      serverCursor: "cursor-2",
      serverTime: "2026-05-16T12:00:00.000Z",
    };

    await expect(
      applyDeltaPushResponse({
        repository,
        response,
        syncedAt: new Date("2026-05-16T12:01:00.000Z"),
      }),
    ).resolves.toEqual({
      acceptedChangeIds: ["change-1", "change-2"],
      rejectedChanges: response.rejectedChanges,
      conflicts: response.conflicts,
      serverCursor: "cursor-2",
    });

    expect(repository.markChangeSynced).toHaveBeenNthCalledWith(
      1,
      "change-1",
      new Date("2026-05-16T12:01:00.000Z"),
    );
    expect(repository.markChangeSynced).toHaveBeenNthCalledWith(
      2,
      "change-2",
      new Date("2026-05-16T12:01:00.000Z"),
    );
  });
});
