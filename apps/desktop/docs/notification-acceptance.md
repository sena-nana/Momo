# 通知验收清单

## BE-11 本地边界

本清单验证本地 BE-11 通知骨架。它覆盖通知契约、内存队列、HTTP-like 列表与确认回执，以及同步事件到通知队列输入的投影；不证明生产通知投递能力。

## 契约与 API 检查

- `NotificationDto` 支持 `approval.required`、`conflict.raised`、`sync.run.failed` 和 `task.due`。
- `createNotificationApi()` 配合 `createInMemoryNotificationStore()` 可以把通知加入本地队列。
- `GET /notifications` 可以按 `queued`、`acknowledged` 或 `all` 列出通知。
- `POST /notifications/:id/ack` 只把通知标记为 `acknowledged`，不会删除通知。
- `projectSyncEventToNotification()` 可以把 `conflict.raised` 和 failed `sync.run.updated` 转换为本地通知队列输入。
- `enqueueNotificationsFromSyncEvents()` 只把投影结果交给注入的通知 API。

## 回归护栏

- 当前只验证本地通知队列语义。
- 不做 push delivery。
- 不做 email delivery。
- 不做 in-app delivery channel。
- 不启动 background worker。
- 不实现用户通知偏好系统。
- 不接生产后端。
- 默认设置页不展示通知。
- 默认设置页路由保持在本地模拟。
