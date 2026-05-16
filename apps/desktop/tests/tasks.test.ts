import { describe, expect, it } from "vitest";
import {
  groupTodayTasks,
  mapTaskRow,
  normalizeCreateTaskInput,
} from "../src/domain/tasks";
import {
  createTaskRepository,
  type LocalChangeRow,
  type SqlDatabase,
} from "../src/data/taskRepository";

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
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS local_changes");
  });

  it("creates a normalized active task row and records a local change", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T04:00:00.000Z"),
      id: () => "task-1",
      changeId: () => "change-1",
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
    expect(db.paramsForSql("INSERT INTO tasks")).toEqual([
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
    expect(db.paramsForSql("INSERT INTO local_changes")).toEqual([
      "change-1",
      "task",
      "task-1",
      "task.create",
      JSON.stringify(task),
      "2026-05-16T04:00:00.000Z",
      null,
    ]);
  });

  it("lists pending local changes and marks them synced", async () => {
    const db = new RecordingDatabase({
      localChanges: [
        {
          id: "change-1",
          entity_type: "task",
          entity_id: "task-1",
          action: "task.update",
          payload: '{"title":"Updated"}',
          created_at: "2026-05-16T04:00:00.000Z",
          synced_at: null,
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T05:00:00.000Z"),
    });

    await expect(repository.listPendingChanges()).resolves.toEqual([
      {
        id: "change-1",
        entityType: "task",
        entityId: "task-1",
        action: "task.update",
        payload: { title: "Updated" },
        createdAt: "2026-05-16T04:00:00.000Z",
        syncedAt: null,
      },
    ]);

    await repository.markChangeSynced("change-1");

    expect(db.paramsForSql("UPDATE local_changes")).toEqual([
      "2026-05-16T05:00:00.000Z",
      "change-1",
    ]);
  });

  it("loads database stats with pending local changes", async () => {
    const db = new RecordingDatabase({
      stats: [
        {
          total_tasks: 4,
          active_tasks: 2,
          completed_tasks: 1,
          pending_local_changes: 3,
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db));

    await expect(repository.getStats()).resolves.toEqual({
      databasePath: "sqlite:momo.db",
      totalTasks: 4,
      activeTasks: 2,
      completedTasks: 1,
      pendingLocalChanges: 3,
    });
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

  constructor(private rows: {
    localChanges?: LocalChangeRow[];
    stats?: Array<{
      total_tasks: number;
      active_tasks: number;
      completed_tasks: number;
      pending_local_changes: number;
    }>;
  } = {}) {}

  get executedSql() {
    return this.calls.map((call) => call.sql);
  }

  async execute(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params });
    return { rowsAffected: 1 };
  }

  async select<T>(sql: string) {
    if (sql.includes("COUNT(*) AS total_tasks")) {
      return (this.rows.stats ?? []) as T[];
    }
    if (sql.includes("FROM local_changes")) {
      return (this.rows.localChanges ?? []) as T[];
    }
    return [] as T[];
  }

  paramsForSql(fragment: string) {
    return this.calls.find((call) => call.sql.includes(fragment))?.params;
  }
}
