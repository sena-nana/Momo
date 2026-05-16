import { describe, expect, it } from "vitest";
import {
  groupTodayTasks,
  mapTaskRow,
  normalizeCreateTaskInput,
} from "../src/domain/tasks";
import { createTaskRepository, type SqlDatabase } from "../src/data/taskRepository";

describe("task domain", () => {
  it("normalizes create input and rejects blank titles", () => {
    expect(normalizeCreateTaskInput({ title: "  Draft plan  " })).toMatchObject({
      title: "Draft plan",
      notes: null,
      priority: 0,
      dueAt: null,
      estimateMin: null,
      tags: [],
    });

    expect(() => normalizeCreateTaskInput({ title: "   " })).toThrow(
      "Task title is required",
    );
  });

  it("maps SQLite rows into task objects", () => {
    expect(
      mapTaskRow({
        id: "task-1",
        title: "Today plan",
        notes: null,
        status: "active",
        priority: 2,
        due_at: "2026-05-16T03:00:00.000Z",
        estimate_min: 45,
        tags: '["focus","writing"]',
        created_at: "2026-05-15T01:00:00.000Z",
        updated_at: "2026-05-15T01:30:00.000Z",
        completed_at: null,
      }),
    ).toEqual({
      id: "task-1",
      title: "Today plan",
      notes: null,
      status: "active",
      priority: 2,
      dueAt: "2026-05-16T03:00:00.000Z",
      estimateMin: 45,
      tags: ["focus", "writing"],
      createdAt: "2026-05-15T01:00:00.000Z",
      updatedAt: "2026-05-15T01:30:00.000Z",
      completedAt: null,
    });
  });

  it("groups today's active, overdue, and completed tasks", () => {
    const now = new Date("2026-05-16T12:00:00+08:00");
    const groups = groupTodayTasks(
      [
        task({ id: "overdue", dueAt: "2026-05-15T04:00:00.000Z" }),
        task({ id: "today", dueAt: "2026-05-16T05:00:00.000Z" }),
        task({
          id: "done",
          status: "completed",
          dueAt: "2026-05-16T02:00:00.000Z",
          completedAt: "2026-05-16T06:00:00.000Z",
        }),
      ],
      now,
    );

    expect(groups.overdue.map((item) => item.id)).toEqual(["overdue"]);
    expect(groups.dueToday.map((item) => item.id)).toEqual(["today"]);
    expect(groups.completedToday.map((item) => item.id)).toEqual(["done"]);
  });
});

describe("TaskRepository", () => {
  it("initializes schema and loads the fixed momo database", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db));

    await repository.init();

    expect(repository.databasePath).toBe("sqlite:momo.db");
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS tasks");
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
  });

  it("creates a normalized active task row", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T04:00:00.000Z"),
      id: () => "task-1",
    });

    const task = await repository.createTask({
      title: "  Read inbox  ",
      dueAt: "2026-05-16T09:30:00.000Z",
      priority: 1,
      tags: ["work"],
    });

    expect(task).toMatchObject({
      id: "task-1",
      title: "Read inbox",
      status: "active",
      dueAt: "2026-05-16T09:30:00.000Z",
      priority: 1,
      tags: ["work"],
      createdAt: "2026-05-16T04:00:00.000Z",
    });
    expect(db.lastParams()).toEqual([
      "task-1",
      "Read inbox",
      null,
      "active",
      1,
      "2026-05-16T09:30:00.000Z",
      null,
      '["work"]',
      "2026-05-16T04:00:00.000Z",
      "2026-05-16T04:00:00.000Z",
      null,
    ]);
  });
});

function task(overrides: Partial<ReturnType<typeof baseTask>>) {
  return { ...baseTask(), ...overrides };
}

function baseTask() {
  return {
    id: "task",
    title: "Task",
    notes: null,
    status: "active" as const,
    priority: 0 as const,
    dueAt: null,
    estimateMin: null,
    tags: [],
    createdAt: "2026-05-16T00:00:00.000Z",
    updatedAt: "2026-05-16T00:00:00.000Z",
    completedAt: null,
  };
}

class RecordingDatabase implements SqlDatabase {
  calls: Array<{ sql: string; params?: unknown[] }> = [];

  get executedSql() {
    return this.calls.map((call) => call.sql);
  }

  async execute(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params });
    return { rowsAffected: 1 };
  }

  async select<T>() {
    return [] as T[];
  }

  lastParams() {
    return this.calls.at(-1)?.params;
  }
}
