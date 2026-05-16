import type { TaskDto, TaskStatusDto } from "../../../packages/contracts/src";

export type TaskActorRole = "owner" | "member" | "viewer";

export interface TaskActor {
  workspaceId: string;
  userId: string;
  role: TaskActorRole;
}

export interface CreateTaskInput {
  title: string;
  notes?: string | null;
  priority?: TaskDto["priority"];
  dueAt?: string | null;
  estimateMin?: number | null;
  tags?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  priority?: TaskDto["priority"];
  dueAt?: string | null;
  estimateMin?: number | null;
  tags?: string[];
}

export interface TaskRepository {
  insert(task: TaskDto): Promise<TaskDto>;
  update(task: TaskDto): Promise<TaskDto>;
  get(workspaceId: string, taskId: string): Promise<TaskDto | null>;
  list(workspaceId: string): Promise<TaskDto[]>;
  delete(workspaceId: string, taskId: string): Promise<void>;
}

export interface TaskService {
  createTask(actor: TaskActor, input: CreateTaskInput): Promise<TaskDto>;
  updateTask(actor: TaskActor, taskId: string, input: UpdateTaskInput): Promise<TaskDto>;
  setStatus(
    actor: TaskActor,
    taskId: string,
    status: TaskStatusDto,
  ): Promise<TaskDto>;
  deleteTask(actor: TaskActor, taskId: string): Promise<void>;
  listTasks(actor: TaskActor): Promise<TaskDto[]>;
}

interface TaskServiceOptions {
  repository: TaskRepository;
  now?: () => Date;
  id?: () => string;
}

export function createTaskService({
  repository,
  now = () => new Date(),
  id = createId,
}: TaskServiceOptions): TaskService {
  return {
    async createTask(actor, input) {
      assertCanWrite(actor);
      const timestamp = now().toISOString();
      const task: TaskDto = {
        id: id(),
        workspaceId: actor.workspaceId,
        title: normalizeTitle(input.title),
        notes: normalizeNullableText(input.notes),
        status: "active",
        priority: normalizePriority(input.priority),
        dueAt: normalizeNullableIso(input.dueAt),
        estimateMin: normalizeEstimate(input.estimateMin),
        tags: normalizeTags(input.tags),
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        version: 1,
      };
      return repository.insert(task);
    },

    async updateTask(actor, taskId, input) {
      assertCanWrite(actor);
      const existing = await requireTask(repository, actor.workspaceId, taskId);
      const task: TaskDto = {
        ...existing,
        ...normalizeUpdate(input),
        updatedAt: now().toISOString(),
        version: existing.version + 1,
      };
      return repository.update(task);
    },

    async setStatus(actor, taskId, status) {
      assertCanWrite(actor);
      const existing = await requireTask(repository, actor.workspaceId, taskId);
      const timestamp = now().toISOString();
      const task: TaskDto = {
        ...existing,
        status,
        completedAt: status === "completed" ? timestamp : null,
        updatedAt: timestamp,
        version: existing.version + 1,
      };
      return repository.update(task);
    },

    async deleteTask(actor, taskId) {
      assertCanWrite(actor);
      await requireTask(repository, actor.workspaceId, taskId);
      await repository.delete(actor.workspaceId, taskId);
    },

    async listTasks(actor) {
      return repository.list(actor.workspaceId);
    },
  };
}

export function createInMemoryTaskRepository(): TaskRepository {
  const workspaces = new Map<string, Map<string, TaskDto>>();

  function workspaceFor(workspaceId: string) {
    let workspace = workspaces.get(workspaceId);
    if (!workspace) {
      workspace = new Map();
      workspaces.set(workspaceId, workspace);
    }
    return workspace;
  }

  return {
    async insert(task) {
      workspaceFor(task.workspaceId).set(task.id, task);
      return task;
    },

    async update(task) {
      workspaceFor(task.workspaceId).set(task.id, task);
      return task;
    },

    async get(workspaceId, taskId) {
      return workspaceFor(workspaceId).get(taskId) ?? null;
    },

    async list(workspaceId) {
      return [...workspaceFor(workspaceId).values()];
    },

    async delete(workspaceId, taskId) {
      workspaceFor(workspaceId).delete(taskId);
    },
  };
}

async function requireTask(
  repository: TaskRepository,
  workspaceId: string,
  taskId: string,
) {
  const task = await repository.get(workspaceId, taskId);
  if (!task) {
    throw new Error("Task not found");
  }
  return task;
}

function assertCanWrite(actor: TaskActor) {
  if (actor.role === "viewer") {
    throw new Error("Actor cannot write tasks");
  }
}

function normalizeUpdate(input: UpdateTaskInput): Partial<TaskDto> {
  const patch: Partial<TaskDto> = {};
  if ("title" in input) patch.title = normalizeTitle(input.title ?? "");
  if ("notes" in input) patch.notes = normalizeNullableText(input.notes);
  if ("priority" in input) patch.priority = normalizePriority(input.priority);
  if ("dueAt" in input) patch.dueAt = normalizeNullableIso(input.dueAt);
  if ("estimateMin" in input) patch.estimateMin = normalizeEstimate(input.estimateMin);
  if ("tags" in input) patch.tags = normalizeTags(input.tags);
  return patch;
}

function normalizeTitle(value: string) {
  const title = value.trim();
  if (!title) {
    throw new Error("Task title is required");
  }
  return title;
}

function normalizeNullableText(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text ? text : null;
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

function normalizePriority(value: TaskDto["priority"] | null | undefined) {
  const priority = value ?? 0;
  if (![0, 1, 2, 3].includes(priority)) {
    throw new Error("Task priority must be between 0 and 3");
  }
  return priority as TaskDto["priority"];
}

function normalizeTags(tags: string[] | undefined) {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))];
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
