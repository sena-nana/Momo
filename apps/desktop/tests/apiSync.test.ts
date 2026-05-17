import { describe, expect, it } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  createDeltaPullRequest,
  createDeltaPushRequest,
  createListSyncEventsRequest,
  createListTaskConflictsRequest,
  createResolveTaskConflictRequest,
  type LocalChangeDto,
} from "../../../packages/contracts/src";
import {
  createInMemorySyncEventStore,
  createInMemorySyncStore,
  createSyncApi,
  createSyncEventApi,
} from "../../../apps/api/src";

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

  it("reports stale baseVersion updates as conflicts without advancing the cursor", async () => {
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
          reason: "Task version conflict",
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

  it("resolves a stored conflict with the server_wins strategy", async () => {
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

  it("resolves a stored conflict with the client_wins strategy", async () => {
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

  it("keeps manual conflict resolution pending without applying the client change", async () => {
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

  it("lists only unresolved conflicts for a workspace", async () => {
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

  it("publishes realtime sync events and catches up by sequence", async () => {
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
      payload: { reason: "Task version conflict" },
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

  it("publishes realtime events for accepted task changes and raised conflicts", async () => {
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
          payload: { reason: "Task version conflict" },
        },
      ],
      latestSequence: 3,
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
