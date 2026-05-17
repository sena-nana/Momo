# Momo API / Sync 骨架

这是路线图 BE-02 / BE-03 / BE-04 / BE-11 前的最小 TypeScript 服务骨架，用于把共享契约接到可测试的服务层。

当前范围：

- 不启动 HTTP 服务。
- 不接 OIDC、PostgreSQL、Redis、WebSocket 或生产环境。
- 只提供纯函数式 `createSyncApi()` 与 `createInMemorySyncStore()`，方便先验证 delta push / pull 语义。
- 只提供纯函数式 `createSyncEventApi()` 与 `createInMemorySyncEventStore()`，方便先验证实时事件补拉语义。
- 只提供纯函数式 `createNotificationApi()` 与 `createInMemoryNotificationStore()`，方便先验证本地通知队列语义。
- 提供纯函数式 `createTaskService()` / `createInMemoryTaskRepository()`，验证任务 CRUD 与 workspace 隔离。
- 提供 HTTP-like `createApiRouter()`，用于在没有真实服务的情况下测试接口分派。
- 后续接真实 API/Gateway 时，应保持契约不变，替换存储与认证边界。

## 路由

当前路由清单由 `API_ROUTES` 导出：

| 方法 | 路径 | 名称 |
|---|---|---|
| GET | `/tasks` | `tasks.list` |
| POST | `/tasks` | `tasks.create` |
| PATCH | `/tasks/:id` | `tasks.update` |
| POST | `/tasks/:id/status` | `tasks.setStatus` |
| DELETE | `/tasks/:id` | `tasks.delete` |
| POST | `/sync/delta/push` | `sync.deltaPush` |
| POST | `/sync/delta/pull` | `sync.deltaPull` |
| GET | `/sync/conflicts` | `sync.listConflicts` |
| POST | `/sync/conflicts/resolve` | `sync.resolveConflict` |
| GET | `/sync/events` | `sync.listEvents` |
| GET | `/notifications` | `notifications.list` |
| POST | `/notifications/:id/ack` | `notifications.acknowledge` |

`GET /sync/conflicts` 是当前内存 sync 的只读待处理冲突列表，返回尚未
`server_wins` / `client_wins` 解决的冲突。`manual` 只表示等待人工处理，
不会把冲突从列表移除。

`POST /sync/conflicts/resolve` 的 `manual` 策略只把冲突标记为等待人工处理：
返回 HTTP-like `202`，body 中 `status` 为 `pending_manual`，`resolvedTask` 为
`null`。该路径不会应用客户端变更、不会删除冲突，也不会推进 `serverCursor`；
后续仍可用 `server_wins` 或 `client_wins` 完成实际解决。

`GET /sync/events` 是当前实时事件的只读补拉路由，按
`afterSequence` 返回后续事件并附带 `latestSequence`。它用于验证断线后补齐契约，不会打开 WebSocket。

`GET /notifications` 返回当前 workspace 的本地通知队列，可按 `queued` /
`acknowledged` / `all` 过滤。`POST /notifications/:id/ack` 只把对应通知标记为
`acknowledged`，不会删除通知，也不会触发真实渠道投递。

## 同步可见性范围

当前内存同步链路已覆盖：

- delta push / pull 的 cursor 语义。
- update/status payload 的 `baseVersion` 冲突检测。
- `server_wins`、`client_wins` 与 `manual` 冲突解决语义。
- `GET /sync/conflicts` 待处理冲突列表。

当前仍没有真实 HTTP 服务、持久化后端、认证、PostgreSQL、WebSocket 或后台同步任务。

## 实时事件范围

BE-04 实时事件当前只实现契约与内存语义：

- `SyncEventDto` 覆盖 `task.changed`、`sync.run.updated` 与 `conflict.raised`。
- `createSyncEventApi()` 可发布内存事件，并用 `GET /sync/events` 按 sequence 补齐。
- 同步生成的实时事件仍只存在于内存边界：已接受的任务变更发布 `task.changed`，冲突发布 `conflict.raised`，被拒绝的变更不会发布 `task.changed`。
- 当前不启动 WebSocket 服务、不接 Redis/event bus、不接生产后端。
- 默认桌面设置页路由仍保留在本地模拟，不会因为该 route 存在而切到远程实时同步。
- BE-04 本地边界验收清单：`docs/realtime-events-acceptance.md`，明确当前不做通知投递、不启动 WebSocket 服务、不接 Redis/event bus。

## 通知范围

BE-11 Notification 骨架当前只实现本地通知队列语义：

- `NotificationDto` 覆盖 `approval.required`、`conflict.raised`、`sync.run.failed` 与 `task.due`。
- `createNotificationApi()` 可把通知加入内存队列，并通过 `GET /notifications` 只读列出。
- `createInMemoryNotificationStore()` 只维护 workspace-scoped queue；`POST /notifications/:id/ack` 只更新 `status` 与 `acknowledgedAt`。
- 通知事件投影边界：`projectSyncEventToNotification()` 可把 `conflict.raised` 和 failed `sync.run.updated` 投影成队列输入；`enqueueNotificationsFromSyncEvents()` 只把这些输入交给注入的 notification API。
- 该投影只是队列来源边界，不是订阅、不是通知投递，也不会启动后台事件消费者。
- 当前不做 push delivery、不做 email delivery、不做 in-app delivery channel、不启动 background worker。
- 默认桌面设置页路由仍保留在本地模拟，不会因为 notification route 存在而展示或订阅真实通知。
- BE-11 本地边界验收清单：`docs/notification-acceptance.md`，明确当前不做投递渠道、不接生产后端、不在默认设置页展示通知。

任务路由目前通过 headers 注入 actor 占位：

- `x-workspace-id`
- `x-user-id`
- `x-role`: `owner` / `member` / `viewer`

这不是认证实现，只是为了让服务层从第一天就带着权限边界参数。

验证：

```bash
.\apps\desktop\node_modules\.bin\tsc.cmd -p apps\api\tsconfig.json
```

仓库根目录也可以运行完整本地验证：

```bash
npm run verify
```
