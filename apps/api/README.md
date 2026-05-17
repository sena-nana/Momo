# Momo API / Sync Skeleton

这是路线图 BE-02 / BE-03 / BE-04 前的最小 TypeScript 服务骨架，用于把共享 sync contract 接到可测试的服务层。

当前范围：

- 不启动 HTTP server。
- 不接 OIDC、PostgreSQL、Redis、WebSocket 或生产环境。
- 只提供纯函数式 `createSyncApi()` 与 `createInMemorySyncStore()`，方便先验证 delta push / pull 语义。
- 只提供纯函数式 `createSyncEventApi()` 与 `createInMemorySyncEventStore()`，方便先验证 realtime event catch-up 语义。
- 提供纯函数式 `createTaskService()` / `createInMemoryTaskRepository()`，验证任务 CRUD 与 workspace 隔离。
- 提供 HTTP-like `createApiRouter()`，用于在没有真实 server 的情况下测试接口分派。
- 后续接真实 API/Gateway 时，应保持 contract 不变，替换存储与认证边界。

## Routes

当前 route manifest 由 `API_ROUTES` 导出：

| Method | Path | Name |
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

`GET /sync/conflicts` 是当前内存 sync 的只读待处理冲突列表，返回尚未
`server_wins` / `client_wins` 解决的冲突。`manual` 只表示等待人工处理，
不会把冲突从列表移除。

`POST /sync/conflicts/resolve` 的 `manual` 策略只把冲突标记为等待人工处理：
返回 HTTP-like `202`，body 中 `status` 为 `pending_manual`，`resolvedTask` 为
`null`。该路径不会应用客户端变更、不会删除冲突，也不会推进 `serverCursor`；
后续仍可用 `server_wins` 或 `client_wins` 完成实际解决。

`GET /sync/events` 是当前 realtime events 的只读 catch-up 路由，按
`afterSequence` 返回后续事件并附带 `latestSequence`。它用于验证断线后补齐
contract，不会打开 WebSocket。

## Sync visibility scope

当前内存同步链路已覆盖：

- delta push / pull 的 cursor 语义。
- update/status payload 的 `baseVersion` 冲突检测。
- `server_wins`、`client_wins` 与 `manual` 冲突解决语义。
- `GET /sync/conflicts` 待处理冲突列表。

当前仍没有真实 HTTP server、持久化后端、认证、PostgreSQL、WebSocket 或后台同步任务。

## Realtime events scope

BE-04 realtime events 当前只实现 contract and in-memory semantics：

- `SyncEventDto` 覆盖 `task.changed`、`sync.run.updated` 与 `conflict.raised`。
- `createSyncEventApi()` 可发布内存事件，并用 `GET /sync/events` 按 sequence 补齐。
- 当前是 no WebSocket server、no Redis/event bus、no production backend。
- 默认桌面 Settings 路由仍保留在 local simulation，不会因为该 route 存在而切到远程实时同步。

Task routes 目前通过 headers 注入 actor 占位：

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
