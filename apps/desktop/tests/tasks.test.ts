import { describe, expect, it } from "vitest";
import {
  groupTodayTasks,
  mapTaskRow,
  normalizeCreateTaskInput,
  type TaskRow,
} from "../src/domain/tasks";
import {
  createTaskRepository,
  type LocalChangeRow,
  type SqlDatabase,
  type TaskSyncVersionRow,
  type SyncRunRow,
  type SyncStateRow,
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
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS sync_state");
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS sync_runs");
    expect(db.executedSql.join("\n")).toContain("CREATE TABLE IF NOT EXISTS task_sync_versions");
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

  it("loads and saves local sync cursor state", async () => {
    const db = new RecordingDatabase({
      syncState: [
        {
          id: "default",
          server_cursor: "cursor-7",
          last_synced_at: "2026-05-16T12:00:00.000Z",
          last_error: "previous failure",
          updated_at: "2026-05-16T12:01:00.000Z",
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T12:02:00.000Z"),
    });

    await expect(repository.getSyncState()).resolves.toEqual({
      serverCursor: "cursor-7",
      lastSyncedAt: "2026-05-16T12:00:00.000Z",
      lastError: "previous failure",
      updatedAt: "2026-05-16T12:01:00.000Z",
    });

    await expect(
      repository.saveSyncState({
        serverCursor: "cursor-8",
        lastSyncedAt: "2026-05-16T12:03:00.000Z",
        lastError: null,
      }),
    ).resolves.toEqual({
      serverCursor: "cursor-8",
      lastSyncedAt: "2026-05-16T12:03:00.000Z",
      lastError: null,
      updatedAt: "2026-05-16T12:02:00.000Z",
    });

    expect(db.paramsForSql("INSERT INTO sync_state")).toEqual([
      "default",
      "cursor-8",
      "2026-05-16T12:03:00.000Z",
      null,
      "2026-05-16T12:02:00.000Z",
    ]);
  });

  it("returns an empty local sync state before the first sync", async () => {
    const repository = createTaskRepository(
      () => Promise.resolve(new RecordingDatabase()),
    );

    await expect(repository.getSyncState()).resolves.toEqual({
      serverCursor: null,
      lastSyncedAt: null,
      lastError: null,
      updatedAt: null,
    });
  });

  it("records and lists recent sync runs", async () => {
    const db = new RecordingDatabase({
      syncRuns: [
        {
          id: "run-2",
          status: "failed",
          started_at: "2026-05-16T12:03:00.000Z",
          finished_at: "2026-05-16T12:03:05.000Z",
          message: "transport unavailable",
          server_cursor: null,
        },
        {
          id: "run-1",
          status: "succeeded",
          started_at: "2026-05-16T12:00:00.000Z",
          finished_at: "2026-05-16T12:00:05.000Z",
          message: "Already synced",
          server_cursor: "cursor-8",
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db), {
      id: () => "task-id",
      changeId: () => "change-id",
      syncRunId: () => "run-3",
    });

    await expect(
      repository.recordSyncRun({
        status: "succeeded",
        startedAt: "2026-05-16T12:05:00.000Z",
        finishedAt: "2026-05-16T12:05:04.000Z",
        message: "1 local change synced",
        serverCursor: "cursor-9",
      }),
    ).resolves.toEqual({
      id: "run-3",
      status: "succeeded",
      startedAt: "2026-05-16T12:05:00.000Z",
      finishedAt: "2026-05-16T12:05:04.000Z",
      message: "1 local change synced",
      serverCursor: "cursor-9",
    });
    expect(db.paramsForSql("INSERT INTO sync_runs")).toEqual([
      "run-3",
      "succeeded",
      "2026-05-16T12:05:00.000Z",
      "2026-05-16T12:05:04.000Z",
      "1 local change synced",
      "cursor-9",
    ]);

    await expect(repository.listRecentSyncRuns(2)).resolves.toEqual([
      {
        id: "run-2",
        status: "failed",
        startedAt: "2026-05-16T12:03:00.000Z",
        finishedAt: "2026-05-16T12:03:05.000Z",
        message: "transport unavailable",
        serverCursor: null,
      },
      {
        id: "run-1",
        status: "succeeded",
        startedAt: "2026-05-16T12:00:00.000Z",
        finishedAt: "2026-05-16T12:00:05.000Z",
        message: "Already synced",
        serverCursor: "cursor-8",
      },
    ]);
    expect(db.paramsForSql("SELECT * FROM sync_runs")).toEqual([2]);
  });

  it("applies pulled remote task changes without recording local changes", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db));

    await repository.applyRemoteTask({
      id: "task-remote",
      title: "Remote task",
      notes: "From sync",
      status: "active",
      priority: 2,
      dueAt: "2026-05-17T02:30:00.000Z",
      estimateMin: 25,
      tags: ["sync"],
      createdAt: "2026-05-16T10:00:00.000Z",
      updatedAt: "2026-05-16T11:00:00.000Z",
      completedAt: null,
    });

    expect(db.paramsForSql("INSERT INTO tasks")).toEqual([
      "task-remote",
      "Remote task",
      "From sync",
      "active",
      2,
      "2026-05-17T02:30:00.000Z",
      25,
      '["sync"]',
      "2026-05-16T10:00:00.000Z",
      "2026-05-16T11:00:00.000Z",
      null,
    ]);
    expect(db.calls.some((call) => call.sql.includes("INSERT INTO local_changes")))
      .toBe(false);
  });

  it("stores pulled remote task versions outside the task UI model", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T12:00:00.000Z"),
    });

    await repository.applyRemoteTask(
      {
        id: "task-remote",
        title: "Remote task",
        notes: null,
        status: "active",
        priority: 1,
        dueAt: null,
        estimateMin: null,
        tags: [],
        createdAt: "2026-05-16T10:00:00.000Z",
        updatedAt: "2026-05-16T11:00:00.000Z",
        completedAt: null,
      },
      8,
    );

    expect(db.paramsForSql("INSERT INTO task_sync_versions")).toEqual([
      "task-remote",
      8,
      "2026-05-16T12:00:00.000Z",
    ]);
    expect(db.calls.some((call) => call.sql.includes("INSERT INTO local_changes")))
      .toBe(false);
  });

  it("records baseVersion on local updates when a remote version is known", async () => {
    const db = new RecordingDatabase({
      taskRows: [
        taskRow({
          id: "task-1",
          title: "Local edit",
          updated_at: "2026-05-16T12:00:00.000Z",
        }),
      ],
      taskSyncVersions: [
        {
          task_id: "task-1",
          remote_version: 8,
          updated_at: "2026-05-16T11:00:00.000Z",
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      changeId: () => "change-1",
    });

    await repository.updateTask("task-1", { title: "Local edit" });

    const localChangeParams = db.paramsForSql("INSERT INTO local_changes");
    expect(localChangeParams?.slice(0, 4)).toEqual([
      "change-1",
      "task",
      "task-1",
      "task.update",
    ]);
    expect(JSON.parse(localChangeParams?.[4] as string)).toEqual({
      id: "task-1",
      baseVersion: 8,
      patch: { title: "Local edit" },
      updatedAt: "2026-05-16T12:00:00.000Z",
    });
  });

  it("records baseVersion on local status changes when a remote version is known", async () => {
    const db = new RecordingDatabase({
      taskRows: [
        taskRow({
          id: "task-1",
          status: "completed",
          completed_at: "2026-05-16T12:00:00.000Z",
          updated_at: "2026-05-16T12:00:00.000Z",
        }),
      ],
      taskSyncVersions: [
        {
          task_id: "task-1",
          remote_version: 5,
          updated_at: "2026-05-16T11:00:00.000Z",
        },
      ],
    });
    const repository = createTaskRepository(() => Promise.resolve(db), {
      now: () => new Date("2026-05-16T12:00:00.000Z"),
      changeId: () => "change-status",
    });

    await repository.setStatus("task-1", "completed");

    const localChangeParams = db.paramsForSql("INSERT INTO local_changes");
    expect(localChangeParams?.slice(0, 4)).toEqual([
      "change-status",
      "task",
      "task-1",
      "task.status",
    ]);
    expect(JSON.parse(localChangeParams?.[4] as string)).toEqual({
      id: "task-1",
      baseVersion: 5,
      status: "completed",
      completedAt: "2026-05-16T12:00:00.000Z",
      updatedAt: "2026-05-16T12:00:00.000Z",
    });
  });

  it("applies pulled remote task deletions without recording local changes", async () => {
    const db = new RecordingDatabase();
    const repository = createTaskRepository(() => Promise.resolve(db));

    await repository.deleteRemoteTask("task-remote");

    expect(db.paramsForSql("DELETE FROM tasks")).toEqual(["task-remote"]);
    expect(db.paramsForSql("DELETE FROM task_sync_versions")).toEqual(["task-remote"]);
    expect(db.calls.some((call) => call.sql.includes("INSERT INTO local_changes")))
      .toBe(false);
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

function taskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task",
    title: "Task",
    notes: null,
    status: "active",
    priority: 0,
    due_at: null,
    estimate_min: null,
    tags: "[]",
    created_at: "2026-05-16T00:00:00.000Z",
    updated_at: "2026-05-16T00:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

class RecordingDatabase implements SqlDatabase {
  calls: Array<{ sql: string; params?: unknown[] }> = [];

  constructor(private rows: {
    localChanges?: LocalChangeRow[];
    taskRows?: TaskRow[];
    taskSyncVersions?: TaskSyncVersionRow[];
    syncState?: SyncStateRow[];
    syncRuns?: SyncRunRow[];
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

  async select<T>(sql: string, params?: unknown[]) {
    this.calls.push({ sql, params });
    if (sql.includes("COUNT(*) AS total_tasks")) {
      return (this.rows.stats ?? []) as T[];
    }
    if (sql.includes("FROM local_changes")) {
      return (this.rows.localChanges ?? []) as T[];
    }
    if (sql.includes("FROM task_sync_versions")) {
      return (this.rows.taskSyncVersions ?? []) as T[];
    }
    if (sql.includes("FROM tasks")) {
      return (this.rows.taskRows ?? []) as T[];
    }
    if (sql.includes("FROM sync_state")) {
      return (this.rows.syncState ?? []) as T[];
    }
    if (sql.includes("FROM sync_runs")) {
      return (this.rows.syncRuns ?? []) as T[];
    }
    return [] as T[];
  }

  paramsForSql(fragment: string) {
    return this.calls.find((call) => call.sql.includes(fragment))?.params;
  }
}
