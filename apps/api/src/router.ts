import type {
  AcknowledgeNotificationRequest,
  DeltaPullRequest,
  DeltaPushRequest,
  ListNotificationsRequest,
  ListSyncEventsRequest,
  ListTaskConflictsRequest,
  ResolveTaskConflictRequest,
} from "../../../packages/contracts/src";
import type {
  CreateTaskInput,
  TaskActor,
  TaskActorRole,
  TaskService,
  UpdateTaskInput,
} from "./tasks";
import type { NotificationApi, SyncApi, SyncEventApi } from "./index";

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
  { method: "GET", path: "/sync/conflicts", name: "sync.listConflicts" },
  {
    method: "POST",
    path: "/sync/conflicts/resolve",
    name: "sync.resolveConflict",
  },
  { method: "GET", path: "/sync/events", name: "sync.listEvents" },
  { method: "GET", path: "/notifications", name: "notifications.list" },
  {
    method: "POST",
    path: "/notifications/:id/ack",
    name: "notifications.acknowledge",
  },
] as const;

interface ApiRouterOptions {
  taskService: TaskService;
  syncApi: SyncApi;
  syncEventApi?: SyncEventApi;
  notificationApi?: NotificationApi;
}

export function createApiRouter({
  taskService,
  syncApi,
  syncEventApi,
  notificationApi,
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
          return await handleSyncRoute(syncApi, syncEventApi, request, segments, body);
        }

        if (segments[0] === "notifications") {
          return await handleNotificationRoute(
            notificationApi,
            request,
            segments,
            body,
          );
        }

        return json(404, { error: "路由不存在" });
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

  return json(404, { error: "路由不存在" });
}

async function handleSyncRoute(
  syncApi: SyncApi,
  syncEventApi: SyncEventApi | undefined,
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

  if (request.method === "GET" && segments.join("/") === "sync/conflicts") {
    return json(200, await syncApi.listConflicts(body as ListTaskConflictsRequest));
  }

  if (request.method === "POST" && segments.join("/") === "sync/conflicts/resolve") {
    const response = await syncApi.resolveConflict(
      body as ResolveTaskConflictRequest,
    );
    return json(response.status === "pending_manual" ? 202 : 200, response);
  }

  if (request.method === "GET" && segments.join("/") === "sync/events") {
    if (!syncEventApi) {
      throw new Error("未配置同步事件 API");
    }
    return json(200, await syncEventApi.listEvents(body as ListSyncEventsRequest));
  }

  return json(404, { error: "路由不存在" });
}

async function handleNotificationRoute(
  notificationApi: NotificationApi | undefined,
  request: ApiRequest,
  segments: string[],
  body: unknown,
) {
  if (!notificationApi) {
    throw new Error("未配置通知 API");
  }

  if (request.method === "GET" && segments.length === 1) {
    return json(
      200,
      await notificationApi.listNotifications(body as ListNotificationsRequest),
    );
  }

  if (request.method === "POST" && segments.length === 3 && segments[2] === "ack") {
    const ackRequest = body as AcknowledgeNotificationRequest;
    if (ackRequest.notificationId !== segments[1]) {
      throw new Error("通知 id 不匹配");
    }
    return json(200, await notificationApi.acknowledgeNotification(ackRequest));
  }

  return json(404, { error: "路由不存在" });
}

function actorFromHeaders(headers: ApiRequest["headers"]): TaskActor {
  const workspaceId = headers?.["x-workspace-id"];
  const userId = headers?.["x-user-id"];
  const role = headers?.["x-role"];

  if (!workspaceId || !userId || !role) {
    throw new Error("缺少操作者请求头");
  }
  if (!isTaskActorRole(role)) {
    throw new Error("操作者角色无效");
  }

  return { workspaceId, userId, role };
}

function parseBody(body: unknown) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("JSON 请求体无效");
  }
}

function requireStatus(body: { status?: Parameters<TaskService["setStatus"]>[2] }) {
  if (!body.status) {
    throw new Error("任务状态不能为空");
  }
  return body.status;
}

function isTaskActorRole(role: string): role is TaskActorRole {
  return role === "owner" || role === "member" || role === "viewer";
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "JSON 请求体无效" || message === "操作者角色无效") {
    return json(400, { error: message });
  }
  if (message === "缺少操作者请求头") {
    return json(401, { error: message });
  }
  if (message === "当前操作者不能写入任务") {
    return json(403, { error: message });
  }
  if (
    message === "任务不存在" ||
    message === "冲突不存在" ||
    message === "通知不存在" ||
    message === "未配置同步事件 API" ||
    message === "未配置通知 API" ||
    message === "路由不存在"
  ) {
    return json(404, { error: message });
  }
  return json(400, { error: message });
}

function json(status: number, body: unknown): ApiResponse {
  return { status, body };
}
