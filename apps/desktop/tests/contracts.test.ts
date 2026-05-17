import { describe, expect, it } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  createDeltaPullRequest,
  createDeltaPushRequest,
  createListSyncEventsRequest,
  createListNotificationsRequest,
  createAcknowledgeNotificationRequest,
  createNotification,
  createListTaskConflictsRequest,
  createResolveTaskConflictRequest,
  createSyncEvent,
  createTaskConflict,
  type LocalChangeDto,
} from "../../../packages/contracts/src";

describe("同步契约", () => {
  it("从本地变更构造带版本的 delta push 请求", () => {
    const changes: LocalChangeDto[] = [
      {
        id: "change-1",
        entityType: "task",
        entityId: "task-1",
        action: "task.create",
        payload: { title: "Write plan" },
        createdAt: "2026-05-16T04:00:00.000Z",
      },
    ];

    expect(
      createDeltaPushRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        changes,
        now: new Date("2026-05-16T05:00:00.000Z"),
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      changes,
      clientSentAt: "2026-05-16T05:00:00.000Z",
    });
  });

  it("构造允许空 cursor 的带版本 delta pull 请求", () => {
    expect(
      createDeltaPullRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        sinceCursor: null,
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      sinceCursor: null,
    });
  });

  it("构造用于人工同步解决的任务冲突 DTO", () => {
    expect(
      createTaskConflict({
        id: "conflict-1",
        workspaceId: "local",
        taskId: "task-1",
        changeId: "change-1",
        reason: "Task changed on server after local edit",
        clientPayload: { title: "Client title" },
        serverTask: null,
        now: new Date("2026-05-16T06:00:00.000Z"),
      }),
    ).toEqual({
      id: "conflict-1",
      workspaceId: "local",
      taskId: "task-1",
      changeId: "change-1",
      reason: "Task changed on server after local edit",
      clientPayload: { title: "Client title" },
      serverTask: null,
      createdAt: "2026-05-16T06:00:00.000Z",
    });
  });

  it("构造带版本的冲突解决请求", () => {
    expect(
      createResolveTaskConflictRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        conflictId: "conflict-1",
        strategy: "server_wins",
        resolvedBy: "user-1",
        note: "Keep server copy",
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      conflictId: "conflict-1",
      strategy: "server_wins",
      resolvedBy: "user-1",
      note: "Keep server copy",
    });
  });

  it("构造带版本的冲突列表请求", () => {
    expect(
      createListTaskConflictsRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
    });
  });

  it("构造实时同步事件 envelope 和补拉请求", () => {
    expect(
      createSyncEvent({
        id: "event-1",
        workspaceId: "local",
        sequence: 7,
        type: "task.changed",
        taskId: "task-1",
        changeId: "change-1",
        payload: { title: "Updated" },
        now: new Date("2026-05-16T07:00:00.000Z"),
      }),
    ).toEqual({
      id: "event-1",
      workspaceId: "local",
      sequence: 7,
      type: "task.changed",
      taskId: "task-1",
      changeId: "change-1",
      payload: { title: "Updated" },
      createdAt: "2026-05-16T07:00:00.000Z",
    });

    expect(
      createListSyncEventsRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        afterSequence: 6,
        limit: 25,
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      afterSequence: 6,
      limit: 25,
    });
  });

  it("构造本地通知队列 envelope 和确认请求", () => {
    expect(
      createNotification({
        id: "notification-1",
        workspaceId: "local",
        type: "conflict.raised",
        title: "同步冲突需要处理",
        body: "任务在两处发生变更",
        sourceEventId: "event-3",
        taskId: "task-1",
        changeId: "change-3",
        conflictId: "conflict-change-3",
        payload: { reason: "任务版本冲突" },
        now: new Date("2026-05-16T08:00:00.000Z"),
      }),
    ).toEqual({
      id: "notification-1",
      workspaceId: "local",
      type: "conflict.raised",
      status: "queued",
      title: "同步冲突需要处理",
      body: "任务在两处发生变更",
      sourceEventId: "event-3",
      taskId: "task-1",
      changeId: "change-3",
      conflictId: "conflict-change-3",
      payload: { reason: "任务版本冲突" },
      createdAt: "2026-05-16T08:00:00.000Z",
      acknowledgedAt: null,
    });

    expect(
      createListNotificationsRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        status: "queued",
        limit: 10,
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      status: "queued",
      limit: 10,
    });

    expect(
      createAcknowledgeNotificationRequest({
        workspaceId: "local",
        deviceId: "desktop-1",
        notificationId: "notification-1",
        acknowledgedBy: "user-1",
      }),
    ).toEqual({
      contractVersion: SYNC_CONTRACT_VERSION,
      workspaceId: "local",
      deviceId: "desktop-1",
      notificationId: "notification-1",
      acknowledgedBy: "user-1",
    });
  });
});
