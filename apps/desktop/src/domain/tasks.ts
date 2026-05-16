export type TaskStatus = "active" | "completed" | "archived";
export type TaskPriority = 0 | 1 | 2 | 3;

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  estimateMin: number | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  estimateMin?: number | null;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  priority?: TaskPriority;
  dueAt?: string | null;
  estimateMin?: number | null;
  tags?: string[];
}

export interface TodayTaskGroups {
  overdue: Task[];
  dueToday: Task[];
  completedToday: Task[];
}

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  priority: number;
  due_at: string | null;
  estimate_min: number | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export function normalizeCreateTaskInput(input: CreateTaskInput) {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Task title is required");
  }

  return {
    title,
    notes: normalizeNullableText(input.notes),
    priority: normalizePriority(input.priority),
    dueAt: normalizeNullableIso(input.dueAt),
    estimateMin: normalizeEstimate(input.estimateMin),
    tags: normalizeTags(input.tags),
  };
}

export function normalizeUpdateTaskInput(input: UpdateTaskInput) {
  const patch: UpdateTaskInput = {};

  if ("title" in input) {
    const title = input.title?.trim() ?? "";
    if (!title) {
      throw new Error("Task title is required");
    }
    patch.title = title;
  }

  if ("notes" in input) patch.notes = normalizeNullableText(input.notes);
  if ("priority" in input) patch.priority = normalizePriority(input.priority);
  if ("dueAt" in input) patch.dueAt = normalizeNullableIso(input.dueAt);
  if ("estimateMin" in input) patch.estimateMin = normalizeEstimate(input.estimateMin);
  if ("tags" in input) patch.tags = normalizeTags(input.tags);

  return patch;
}

export function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: normalizeStatus(row.status),
    priority: normalizePriority(row.priority),
    dueAt: row.due_at,
    estimateMin: row.estimate_min,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export function groupTodayTasks(tasks: Task[], now = new Date()): TodayTaskGroups {
  const { start, end } = getDayBounds(now);
  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const completedToday: Task[] = [];

  for (const task of sortTasks(tasks)) {
    if (task.status === "completed" && task.completedAt) {
      const completedAt = new Date(task.completedAt);
      if (completedAt >= start && completedAt <= end) {
        completedToday.push(task);
      }
      continue;
    }

    if (task.status !== "active" || !task.dueAt) continue;

    const dueAt = new Date(task.dueAt);
    if (dueAt < start) {
      overdue.push(task);
    } else if (dueAt <= end) {
      dueToday.push(task);
    }
  }

  return { overdue, dueToday, completedToday };
}

export function getDayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const aTime = a.dueAt ?? a.completedAt ?? a.createdAt;
    const bTime = b.dueAt ?? b.completedAt ?? b.createdAt;
    const byTime = aTime.localeCompare(bTime);
    if (byTime !== 0) return byTime;
    return b.priority - a.priority;
  });
}

function normalizeNullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeNullableIso(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Task date must be a valid ISO date");
  }
  return date.toISOString();
}

function normalizeEstimate(value: number | null | undefined) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Task estimate must be a positive integer");
  }
  return value;
}

function normalizePriority(value: number | null | undefined): TaskPriority {
  const priority = value ?? 0;
  if (![0, 1, 2, 3].includes(priority)) {
    throw new Error("Task priority must be between 0 and 3");
  }
  return priority as TaskPriority;
}

function normalizeStatus(status: string): TaskStatus {
  if (status === "active" || status === "completed" || status === "archived") {
    return status;
  }
  return "active";
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function parseTags(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeTags(parsed.map(String)) : [];
  } catch {
    return [];
  }
}
