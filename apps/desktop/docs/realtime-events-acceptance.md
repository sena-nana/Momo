# 实时事件验收清单

## BE-04 本地边界

本清单验证本地 BE-04 实时事件骨架。它覆盖事件契约、内存发布、HTTP-like 补拉、transport 适配器和桌面端只读摘要；不证明生产实时协作能力。

## 契约与 API 检查

- `SyncEventDto` 支持 `task.changed`、`conflict.raised` 和 `sync.run.updated`。
- `createSyncEventApi()` 配合 `createInMemorySyncEventStore()` 可以发布事件，并按 `afterSequence` 列出事件。
- 已接受的任务变更会发布 `task.changed`。
- 已产生的冲突会发布 `conflict.raised`。
- 被拒绝的变更不会发布 `task.changed`。

## 补拉检查

- `GET /sync/events` 返回带有 `latestSequence` 的 sequence 补拉结果。
- `createHttpLikeSyncTransport()` 可以调用 `GET /sync/events`。
- `createHttpSyncTransport()` 可以通过注入的 `fetch` 请求 `/sync/events`。
- `summarizeSyncEvents()` 会把事件映射成只读展示摘要。
- `fetchRealtimeEventCatchUp()` 返回摘要且不会运行同步。

## 回归护栏

- 不启动 WebSocket server。
- 不接 Redis/event bus。
- 不接生产后端。
- 不做通知投递。
- 不启动后台事件订阅。
- 默认设置页路由不订阅实时事件。
- 默认设置页路由保持在本地模拟。
