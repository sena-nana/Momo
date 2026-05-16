import { describe, expect, it, vi } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  type DeltaPushResponse,
  type TaskConflictDto,
} from "../../../packages/contracts/src";
import type { TaskRepository } from "../src/data/taskRepository";
import {
  applyDeltaPushResponse,
  buildDeltaPushFromPendingChanges,
  summarizePendingConflicts,
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

  it("summarizes pending conflicts without applying a resolution", () => {
    const conflicts: TaskConflictDto[] = [
      {
        id: "conflict-1",
        workspaceId: "local",
        taskId: "task-1",
        changeId: "change-4",
        reason: "Task version conflict",
        clientPayload: {
          id: "task-1",
          patch: { title: "Local title", priority: 3 },
          updatedAt: "2026-05-16T12:00:00.000Z",
        },
        serverTask: {
          id: "task-1",
          workspaceId: "local",
          title: "Server title",
          notes: null,
          status: "active",
          priority: 1,
          dueAt: null,
          estimateMin: null,
          tags: [],
          createdAt: "2026-05-16T10:00:00.000Z",
          updatedAt: "2026-05-16T11:00:00.000Z",
          completedAt: null,
          version: 5,
        },
        createdAt: "2026-05-16T12:01:00.000Z",
      },
      {
        id: "conflict-2",
        workspaceId: "local",
        taskId: "task-2",
        changeId: "change-5",
        reason: "Task version conflict",
        clientPayload: { status: "completed" },
        serverTask: null,
        createdAt: "2026-05-16T12:02:00.000Z",
      },
    ];

    expect(summarizePendingConflicts(conflicts)).toEqual([
      {
        id: "conflict-1",
        taskId: "task-1",
        changeId: "change-4",
        reason: "Task version conflict",
        createdAt: "2026-05-16T12:01:00.000Z",
        serverTaskTitle: "Server title",
        serverTaskVersion: 5,
        clientPayloadSummary: 'patch: {"title":"Local title","priority":3}',
      },
      {
        id: "conflict-2",
        taskId: "task-2",
        changeId: "change-5",
        reason: "Task version conflict",
        createdAt: "2026-05-16T12:02:00.000Z",
        serverTaskTitle: null,
        serverTaskVersion: null,
        clientPayloadSummary: 'status: "completed"',
      },
    ]);
  });
});
