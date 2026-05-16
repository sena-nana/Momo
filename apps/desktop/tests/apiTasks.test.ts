import { describe, expect, it } from "vitest";
import {
  createInMemoryTaskRepository,
  createTaskService,
  type TaskActor,
} from "../../../apps/api/src";

describe("Core API task service skeleton", () => {
  it("creates, updates, completes, deletes, and lists workspace-scoped tasks", async () => {
    const service = createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    });
    const actor = member("workspace-a");

    const created = await service.createTask(actor, {
      title: "  Draft API  ",
      notes: "first pass",
      priority: 1,
      tags: ["api"],
    });

    expect(created).toMatchObject({
      id: "task-1",
      workspaceId: "workspace-a",
      title: "Draft API",
      notes: "first pass",
      status: "active",
      priority: 1,
      tags: ["api"],
      createdAt: "2026-05-16T12:00:00.000Z",
      updatedAt: "2026-05-16T12:00:00.000Z",
      version: 1,
    });
    await expect(service.listTasks(member("workspace-b"))).resolves.toEqual([]);

    const updated = await service.updateTask(actor, "task-1", {
      title: "API contract",
      notes: null,
      priority: 3,
      dueAt: "2026-05-18T02:00:00.000Z",
    });

    expect(updated).toMatchObject({
      title: "API contract",
      notes: null,
      priority: 3,
      dueAt: "2026-05-18T02:00:00.000Z",
      version: 2,
    });

    const completed = await service.setStatus(actor, "task-1", "completed");
    expect(completed).toMatchObject({
      status: "completed",
      completedAt: "2026-05-16T12:00:00.000Z",
      version: 3,
    });

    await service.deleteTask(actor, "task-1");
    await expect(service.listTasks(actor)).resolves.toEqual([]);
  });

  it("rejects writes from read-only actors", async () => {
    const service = createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    });

    await expect(
      service.createTask(viewer("workspace-a"), { title: "Read only" }),
    ).rejects.toThrow("Actor cannot write tasks");
  });

  it("rejects blank task titles", async () => {
    const service = createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    });

    await expect(
      service.createTask(member("workspace-a"), { title: "   " }),
    ).rejects.toThrow("Task title is required");
  });
});

function member(workspaceId: string): TaskActor {
  return { workspaceId, userId: "user-1", role: "member" };
}

function viewer(workspaceId: string): TaskActor {
  return { workspaceId, userId: "user-2", role: "viewer" };
}
