import { describe, expect, it } from "vitest";
import {
  SYNC_CONTRACT_VERSION,
  createDeltaPullRequest,
  createDeltaPushRequest,
  createTaskConflict,
  type LocalChangeDto,
} from "../../../packages/contracts/src";

describe("sync contracts", () => {
  it("builds a versioned delta push request from local changes", () => {
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

  it("builds a versioned delta pull request with nullable cursor", () => {
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

  it("builds a task conflict DTO for manual sync resolution", () => {
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
});
