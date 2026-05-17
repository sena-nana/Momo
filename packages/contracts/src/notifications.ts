import { SYNC_CONTRACT_VERSION } from "./sync";

export type NotificationTypeDto =
  | "approval.required"
  | "conflict.raised"
  | "sync.run.failed"
  | "task.due";

export type NotificationStatusDto = "queued" | "acknowledged";
export type NotificationListStatusDto = NotificationStatusDto | "all";

export interface NotificationDto {
  id: string;
  workspaceId: string;
  type: NotificationTypeDto;
  status: NotificationStatusDto;
  title: string;
  body: string | null;
  sourceEventId: string | null;
  taskId?: string;
  changeId?: string;
  conflictId?: string;
  payload: unknown;
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface ListNotificationsRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
  status: NotificationListStatusDto;
  limit: number;
}

export interface ListNotificationsResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  notifications: NotificationDto[];
  serverTime: string;
}

export interface AcknowledgeNotificationRequest {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  workspaceId: string;
  deviceId: string;
  notificationId: string;
  acknowledgedBy: string;
}

export interface AcknowledgeNotificationResponse {
  contractVersion: typeof SYNC_CONTRACT_VERSION;
  notification: NotificationDto;
  serverTime: string;
}

export function createNotification(input: {
  id: string;
  workspaceId: string;
  type: NotificationTypeDto;
  title: string;
  body?: string | null;
  sourceEventId?: string | null;
  taskId?: string;
  changeId?: string;
  conflictId?: string;
  payload: unknown;
  now: Date;
}): NotificationDto {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    type: input.type,
    status: "queued",
    title: input.title,
    body: input.body ?? null,
    sourceEventId: input.sourceEventId ?? null,
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.changeId ? { changeId: input.changeId } : {}),
    ...(input.conflictId ? { conflictId: input.conflictId } : {}),
    payload: input.payload,
    createdAt: input.now.toISOString(),
    acknowledgedAt: null,
  };
}

export function createListNotificationsRequest(input: {
  workspaceId: string;
  deviceId: string;
  status?: NotificationListStatusDto;
  limit: number;
}): ListNotificationsRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    status: input.status ?? "queued",
    limit: input.limit,
  };
}

export function createAcknowledgeNotificationRequest(input: {
  workspaceId: string;
  deviceId: string;
  notificationId: string;
  acknowledgedBy: string;
}): AcknowledgeNotificationRequest {
  return {
    contractVersion: SYNC_CONTRACT_VERSION,
    workspaceId: input.workspaceId,
    deviceId: input.deviceId,
    notificationId: input.notificationId,
    acknowledgedBy: input.acknowledgedBy,
  };
}
