import Database from "@tauri-apps/plugin-sql";
import {
  getDayBounds,
  groupTodayTasks,
  mapTaskRow,
  normalizeCreateTaskInput,
  normalizeUpdateTaskInput,
  type CreateTaskInput,
  type Task,
  type TaskRow,
  type TaskStatus,
  type TodayTaskGroups,
  type UpdateTaskInput,
} from "../domain/tasks";

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

export interface TaskRepository {
  databasePath: string;
  init(): Promise<void>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, patch: UpdateTaskInput): Promise<Task>;
  setStatus(id: string, status: TaskStatus): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  listPendingChanges(): Promise<LocalChange[]>;
  markChangeSynced(id: string, syncedAt?: Date): Promise<void>;
  listToday(now: Date): Promise<TodayTaskGroups>;
  listInbox(): Promise<Task[]>;
  listAgenda(start: Date, end: Date): Promise<Task[]>;
  getStats(): Promise<DatabaseStats>;
}

export type LocalChangeAction =
  | "task.create"
  | "task.update"
  | "task.status"
  | "task.delete";

export interface LocalChange {
  id: string;
  entityType: "task";
  entityId: string;
  action: LocalChangeAction;
  payload: unknown;
  createdAt: string;
  syncedAt: string | null;
}

export interface LocalChangeRow {
  id: string;
  entity_type: "task";
  entity_id: string;
  action: LocalChangeAction;
  payload: string;
  created_at: string;
  synced_at: string | null;
}

export interface DatabaseStats {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  pendingLocalChanges: number;
  databasePath: string;
}

interface RepositoryOptions {
  now?: () => Date;
  id?: () => string;
  changeId?: () => string;
}

type DatabaseLoader = (path: string) => Promise<SqlDatabase>;

const MOMO_DATABASE_PATH = "sqlite:momo.db";

export function createTaskRepository(
  loadDatabase: DatabaseLoader = (path) => Database.load(path),
  options: RepositoryOptions = {},
): TaskRepository {
  let dbPromise: Promise<SqlDatabase> | null = null;
  let initialized = false;
  const now = options.now ?? (() => new Date());
  const id = options.id ?? createId;
  const changeId = options.changeId ?? createId;

  async function getDb() {
    dbPromise ??= loadDatabase(MOMO_DATABASE_PATH);
    return dbPromise;
  }

  async function init() {
    if (initialized) return;
    const db = await getDb();
    for (const statement of SCHEMA) {
      await db.execute(statement);
    }
    initialized = true;
  }

  async function selectTask(taskId: string) {
    const db = await getDb();
    const rows = await db.select<TaskRow>(
      "SELECT * FROM tasks WHERE id = $1 LIMIT 1",
      [taskId],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Task not found");
    }
    return mapTaskRow(row);
  }

  async function recordLocalChange(
    db: SqlDatabase,
    entityId: string,
    action: LocalChangeAction,
    payload: unknown,
    createdAt = now().toISOString(),
  ) {
    await db.execute(
      `INSERT INTO local_changes (
        id, entity_type, entity_id, action, payload, created_at, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        changeId(),
        "task",
        entityId,
        action,
        JSON.stringify(payload),
        createdAt,
        null,
      ],
    );
  }

  return {
    databasePath: MOMO_DATABASE_PATH,

    init,

    async createTask(input) {
      await init();
      const normalized = normalizeCreateTaskInput(input);
      const timestamp = now().toISOString();
      const task: Task = {
        id: id(),
        title: normalized.title,
        notes: normalized.notes,
        status: "active",
        priority: normalized.priority,
        dueAt: normalized.dueAt,
        estimateMin: normalized.estimateMin,
        tags: normalized.tags,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      };

      const db = await getDb();
      await db.execute(
        `INSERT INTO tasks (
          id, title, notes, status, priority, due_at, estimate_min, tags,
          created_at, updated_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          task.id,
          task.title,
          task.notes,
          task.status,
          task.priority,
          task.dueAt,
          task.estimateMin,
          JSON.stringify(task.tags),
          task.createdAt,
          task.updatedAt,
          task.completedAt,
        ],
      );
      await recordLocalChange(db, task.id, "task.create", task, timestamp);
      return task;
    },

    async updateTask(taskId, patch) {
      await init();
      const normalized = normalizeUpdateTaskInput(patch);
      const updates: string[] = [];
      const values: unknown[] = [];

      appendUpdate(updates, values, "title", normalized.title);
      appendUpdate(updates, values, "notes", normalized.notes);
      appendUpdate(updates, values, "priority", normalized.priority);
      appendUpdate(updates, values, "due_at", normalized.dueAt);
      appendUpdate(updates, values, "estimate_min", normalized.estimateMin);
      if ("tags" in normalized) {
        appendUpdate(updates, values, "tags", JSON.stringify(normalized.tags));
      }

      if (updates.length > 0) {
        const timestamp = now().toISOString();
        appendUpdate(updates, values, "updated_at", timestamp);
        values.push(taskId);
        const db = await getDb();
        await db.execute(
          `UPDATE tasks SET ${updates.join(", ")} WHERE id = $${values.length}`,
          values,
        );
        await recordLocalChange(db, taskId, "task.update", {
          id: taskId,
          patch: normalized,
          updatedAt: timestamp,
        }, timestamp);
      }

      return selectTask(taskId);
    },

    async setStatus(taskId, status) {
      await init();
      const timestamp = now().toISOString();
      const completedAt = status === "completed" ? timestamp : null;
      const db = await getDb();
      await db.execute(
        "UPDATE tasks SET status = $1, completed_at = $2, updated_at = $3 WHERE id = $4",
        [status, completedAt, timestamp, taskId],
      );
      await recordLocalChange(db, taskId, "task.status", {
        id: taskId,
        status,
        completedAt,
        updatedAt: timestamp,
      }, timestamp);
      return selectTask(taskId);
    },

    async deleteTask(taskId) {
      await init();
      const timestamp = now().toISOString();
      const db = await getDb();
      await db.execute("DELETE FROM tasks WHERE id = $1", [taskId]);
      await recordLocalChange(db, taskId, "task.delete", { id: taskId }, timestamp);
    },

    async listPendingChanges() {
      await init();
      const db = await getDb();
      const rows = await db.select<LocalChangeRow>(
        `SELECT * FROM local_changes
         WHERE synced_at IS NULL
         ORDER BY created_at ASC`,
      );
      return rows.map(mapLocalChangeRow);
    },

    async markChangeSynced(changeIdToMark, syncedAt = now()) {
      await init();
      const db = await getDb();
      await db.execute(
        "UPDATE local_changes SET synced_at = $1 WHERE id = $2",
        [syncedAt.toISOString(), changeIdToMark],
      );
    },

    async listToday(currentDate) {
      await init();
      const { start, end } = getDayBounds(currentDate);
      const db = await getDb();
      const rows = await db.select<TaskRow>(
        `SELECT * FROM tasks
         WHERE (status = 'active' AND due_at IS NOT NULL AND due_at <= $1)
            OR (status = 'completed' AND completed_at >= $2 AND completed_at <= $1)
         ORDER BY COALESCE(due_at, completed_at, created_at), priority DESC`,
        [end.toISOString(), start.toISOString()],
      );
      return groupTodayTasks(rows.map(mapTaskRow), currentDate);
    },

    async listInbox() {
      await init();
      const db = await getDb();
      const rows = await db.select<TaskRow>(
        "SELECT * FROM tasks WHERE status = 'active' AND due_at IS NULL ORDER BY created_at DESC",
      );
      return rows.map(mapTaskRow);
    },

    async listAgenda(start, end) {
      await init();
      const db = await getDb();
      const rows = await db.select<TaskRow>(
        `SELECT * FROM tasks
         WHERE status != 'archived' AND due_at >= $1 AND due_at <= $2
         ORDER BY due_at ASC, priority DESC`,
        [start.toISOString(), end.toISOString()],
      );
      return rows.map(mapTaskRow);
    },

    async getStats() {
      await init();
      const db = await getDb();
      const rows = await db.select<{
        total_tasks: number;
        active_tasks: number;
        completed_tasks: number;
        pending_local_changes: number;
      }>(
        `SELECT
          COUNT(*) AS total_tasks,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
          (
            SELECT COUNT(*)
            FROM local_changes
            WHERE synced_at IS NULL
          ) AS pending_local_changes
         FROM tasks`,
      );
      const stats = rows[0] ?? {
        total_tasks: 0,
        active_tasks: 0,
        completed_tasks: 0,
        pending_local_changes: 0,
      };
      return {
        totalTasks: Number(stats.total_tasks ?? 0),
        activeTasks: Number(stats.active_tasks ?? 0),
        completedTasks: Number(stats.completed_tasks ?? 0),
        pendingLocalChanges: Number(stats.pending_local_changes ?? 0),
        databasePath: MOMO_DATABASE_PATH,
      };
    },
  };
}

function appendUpdate(
  updates: string[],
  values: unknown[],
  column: string,
  value: unknown,
) {
  if (value === undefined) return;
  values.push(value);
  updates.push(`${column} = $${values.length}`);
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')),
    priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
    due_at TEXT,
    estimate_min INTEGER CHECK (estimate_min IS NULL OR estimate_min > 0),
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS local_changes (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    synced_at TEXT
  )`,
  `INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
   VALUES (1, 'create_tasks', datetime('now'))`,
  `INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
   VALUES (2, 'create_local_changes', datetime('now'))`,
];

function mapLocalChangeRow(row: LocalChangeRow): LocalChange {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    payload: parsePayload(row.payload),
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
}

function parsePayload(payload: string) {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}
