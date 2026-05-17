import { describe, expect, it } from "vitest";
import {
  createInMemoryTaskRepository,
  createTaskService,
  type TaskActor,
} from "../../../apps/api/src";

describe("核心 API 任务服务骨架", () => {
  it("创建、更新、完成、删除并列出 workspace 范围内的任务", async () => {
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

  it("拒绝只读 actor 的写入", async () => {
    const service = createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    });

    await expect(
      service.createTask(viewer("workspace-a"), { title: "Read only" }),
    ).rejects.toThrow("当前操作者不能写入任务");
  });

  it("拒绝空白任务标题", async () => {
    const service = createTaskService({
      repository: createInMemoryTaskRepository(),
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      id: () => "task-1",
    });

    await expect(
      service.createTask(member("workspace-a"), { title: "   " }),
    ).rejects.toThrow("任务标题不能为空");
  });
});

function member(workspaceId: string): TaskActor {
  return { workspaceId, userId: "user-1", role: "member" };
}

function viewer(workspaceId: string): TaskActor {
  return { workspaceId, userId: "user-2", role: "viewer" };
}
