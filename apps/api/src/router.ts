import type {
  DeltaPullRequest,
  DeltaPushRequest,
  ResolveTaskConflictRequest,
} from "../../../packages/contracts/src";
import type {
  CreateTaskInput,
  TaskActor,
  TaskActorRole,
  TaskService,
  UpdateTaskInput,
} from "./tasks";
import type { SyncApi } from "./index";

export interface ApiRequest {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface ApiRouter {
  handle(request: ApiRequest): Promise<ApiResponse>;
}

export const API_ROUTES = [
  { method: "GET", path: "/tasks", name: "tasks.list" },
  { method: "POST", path: "/tasks", name: "tasks.create" },
  { method: "PATCH", path: "/tasks/:id", name: "tasks.update" },
  { method: "POST", path: "/tasks/:id/status", name: "tasks.setStatus" },
  { method: "DELETE", path: "/tasks/:id", name: "tasks.delete" },
  { method: "POST", path: "/sync/delta/push", name: "sync.deltaPush" },
  { method: "POST", path: "/sync/delta/pull", name: "sync.deltaPull" },
  {
    method: "POST",
    path: "/sync/conflicts/resolve",
    name: "sync.resolveConflict",
  },
] as const;

interface ApiRouterOptions {
  taskService: TaskService;
  syncApi: SyncApi;
}

export function createApiRouter({
  taskService,
  syncApi,
}: ApiRouterOptions): ApiRouter {
  return {
    async handle(request) {
      try {
        const body = parseBody(request.body);
        const segments = request.path.split("/").filter(Boolean);

        if (segments[0] === "tasks") {
          return await handleTaskRoute(taskService, request, segments, body);
        }

        if (segments[0] === "sync") {
          return await handleSyncRoute(syncApi, request, segments, body);
        }

        return json(404, { error: "Route not found" });
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}

async function handleTaskRoute(
  taskService: TaskService,
  request: ApiRequest,
  segments: string[],
  body: unknown,
) {
  const actor = actorFromHeaders(request.headers);

  if (request.method === "GET" && segments.length === 1) {
    return json(200, { tasks: await taskService.listTasks(actor) });
  }

  if (request.method === "POST" && segments.length === 1) {
    return json(201, {
      task: await taskService.createTask(actor, body as CreateTaskInput),
    });
  }

  if (request.method === "PATCH" && segments.length === 2) {
    return json(200, {
      task: await taskService.updateTask(
        actor,
        segments[1],
        body as UpdateTaskInput,
      ),
    });
  }

  if (request.method === "POST" && segments.length === 3 && segments[2] === "status") {
    const statusBody = body as { status?: Parameters<TaskService["setStatus"]>[2] };
    return json(200, {
      task: await taskService.setStatus(actor, segments[1], requireStatus(statusBody)),
    });
  }

  if (request.method === "DELETE" && segments.length === 2) {
    await taskService.deleteTask(actor, segments[1]);
    return json(204, null);
  }

  return json(404, { error: "Route not found" });
}

async function handleSyncRoute(
  syncApi: SyncApi,
  request: ApiRequest,
  segments: string[],
  body: unknown,
) {
  if (request.method === "POST" && segments.join("/") === "sync/delta/push") {
    return json(200, await syncApi.deltaPush(body as DeltaPushRequest));
  }

  if (request.method === "POST" && segments.join("/") === "sync/delta/pull") {
    return json(200, await syncApi.deltaPull(body as DeltaPullRequest));
  }

  if (request.method === "POST" && segments.join("/") === "sync/conflicts/resolve") {
    const response = await syncApi.resolveConflict(
      body as ResolveTaskConflictRequest,
    );
    return json(response.status === "pending_manual" ? 202 : 200, response);
  }

  return json(404, { error: "Route not found" });
}

function actorFromHeaders(headers: ApiRequest["headers"]): TaskActor {
  const workspaceId = headers?.["x-workspace-id"];
  const userId = headers?.["x-user-id"];
  const role = headers?.["x-role"];

  if (!workspaceId || !userId || !role) {
    throw new Error("Missing actor headers");
  }
  if (!isTaskActorRole(role)) {
    throw new Error("Invalid actor role");
  }

  return { workspaceId, userId, role };
}

function parseBody(body: unknown) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function requireStatus(body: { status?: Parameters<TaskService["setStatus"]>[2] }) {
  if (!body.status) {
    throw new Error("Task status is required");
  }
  return body.status;
}

function isTaskActorRole(role: string): role is TaskActorRole {
  return role === "owner" || role === "member" || role === "viewer";
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Invalid JSON body" || message === "Invalid actor role") {
    return json(400, { error: message });
  }
  if (message === "Missing actor headers") {
    return json(401, { error: message });
  }
  if (message === "Actor cannot write tasks") {
    return json(403, { error: message });
  }
  if (
    message === "Task not found" ||
    message === "Conflict not found" ||
    message === "Route not found"
  ) {
    return json(404, { error: message });
  }
  return json(400, { error: message });
}

function json(status: number, body: unknown): ApiResponse {
  return { status, body };
}
