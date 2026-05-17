# Momo · Desktop (Tauri 2 + Vue 3 + TypeScript)

桌面端本地 MVP。当前完成了 Tauri 2 + Vue 3 + TypeScript 壳、本地 SQLite 任务存储、Today / Inbox / Calendar / Settings 四个主页面、widget 窗口，以及后续同步使用的共享 contract 骨架。

## 前置工具链

| 组件 | 已验证版本 |
|---|---|
| Node.js | 24.13.0 |
| npm | 11.6.2 |
| Rust / cargo | 1.93.1 |
| Tauri CLI | 2.x（随 npm 依赖安装） |

Windows 上首次运行需要 **Microsoft Edge WebView2 Runtime**（Win10 1803+ 通常已内置）与 **MSVC build tools**（`rustup` 安装时若选 `default-host` 通常已带）。

## 安装

```bash
npm install
```

## 命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 仅启动 Vite 前端（http://localhost:1420） |
| `npm run test` | 运行 Vitest 单元与页面测试 |
| `npm run build` | TypeScript 检查 + Vite 生产构建 |
| `npm run tauri dev` | 启动 Tauri 桌面壳（带 WebView 窗口） |
| `npm run tauri build` | 打包 Windows 安装器 |
| `cargo check`（在 `src-tauri/`） | 仅校验 Rust 端是否能编译 |
| `.\apps\desktop\node_modules\.bin\tsc.cmd -p packages\contracts\tsconfig.json`（在仓库根目录） | 校验共享 contract 包 |
| `npm run verify`（在仓库根目录） | 串行运行 desktop test/build、Tauri check、contracts/API TypeScript 检查 |

## 路由

`/login`, `/today`, `/inbox`, `/calendar`, `/settings`, `/widget`，根路径自动跳 `/today`。

## 本地数据

- SQLite 由 `@tauri-apps/plugin-sql` / `tauri-plugin-sql` 提供，连接固定为 `sqlite:momo.db`。
- 前端通过 `TaskRepository` 访问数据，页面不直接写 SQL。
- 当前 schema 包含 `schema_migrations`、`tasks`、`local_changes`、`sync_state`、`sync_runs` 与 `task_sync_versions`；`tags` 以 JSON text 存储，时间统一保存 ISO 字符串。
- `Today` 支持快速添加今日或 Inbox 任务、查看逾期/今日/今日完成；`Inbox` 支持编辑、完成、删除无截止日期任务；`Calendar` 先提供未来 7 天只读 agenda。
- `local_changes` 记录本地 create / update / status / delete 变更，为后续 Delta Sync 使用。
- `Settings` 的 Local database 卡片显示 `Pending sync`，即尚未标记 synced 的本地变更数量。
- `TaskRepository.getSyncState()` / `saveSyncState()` 读写本地同步状态：最新 server cursor、最近同步时间、最近错误与状态更新时间。
- `TaskRepository.recordSyncRun()` / `listRecentSyncRuns()` 维护 sync run history：记录每次手动同步演示的成功/失败、开始/结束时间、message 与 cursor，作为 Settings 后续可见性的本地边界。
- `task_sync_versions` 保存远端 task version，`applyRemoteTask(task, remoteVersion)` 在 pull 应用时更新该基线，不把 version 泄进通用 Task UI 模型。
- 本地 `updateTask()` / `setStatus()` 记录 `local_changes` 时，如果存在远端版本，会把 `baseVersion` 写入 payload，用于后续 Delta Sync 冲突检测。
- `summarizePendingLocalChanges()` 可把待同步本地变更映射为只读摘要：change id、entity label、action、createdAt 和 payload 摘要。
- `summarizeSyncEvents()` 可把 realtime event catch-up 结果映射为只读摘要；`fetchRealtimeEventCatchUp()` 只调用可选 `transport.listEvents()`，缺失时返回 `Realtime event catch-up is not available`，不会触发同步运行。
- Settings 会从 `TaskRepository.listPendingChanges()` 读取待同步本地变更，展示只读 `Pending changes` 卡片。
- Pending changes load errors do not hide Local database, Sync state, or Sync history；该失败只影响局部卡片和 `Retry pending changes`。
- 本地同步演示成功或失败后也会刷新 `Pending changes`，让本地队列变化可追溯。

## 共享契约

- `packages/contracts` 定义 Task DTO、LocalChange DTO、Delta Push/Pull 请求响应类型。
- BE-04 realtime events are currently contract and in-memory semantics only: `SyncEventDto`、`createListSyncEventsRequest()` 与 HTTP-like `GET /sync/events` 只验证按 sequence catch up。
- sync-generated realtime events stay in the in-memory boundary: accepted task changes publish `task.changed`，conflicts publish `conflict.raised`，rejected changes do not publish `task.changed`。
- 当前仅做纯 TypeScript contract，不接生产后端、不实现 OIDC / PostgreSQL / WebSocket。

## 本地同步前置层

- `buildDeltaPushFromPendingChanges()` 从 `TaskRepository.listPendingChanges()` 构造 `DeltaPushRequest`。
- `applyDeltaPushResponse()` 会把服务端 accepted change ids 通过 `TaskRepository.markChangeSynced()` 标记为已同步。
- `applyDeltaPullResponse()` 会把 delta pull 结果应用到本地 SQLite：`applyRemoteTask()` upsert 远端任务，`deleteRemoteTask()` 删除远端已删除任务，并更新 `sync_state.serverCursor`。
- 远端 pull 应用不会记录本地变更：`applyRemoteTask()` / `deleteRemoteTask()` 会修改 `tasks`，但 without writing `local_changes`。
- `runLocalSyncSimulation()` 可用注入的内存 sync API 串起 pending changes、delta push、accepted 标记与 pending conflict 摘要，用于本地端到端演练；返回值包含 `pendingConflictCount`。
- `createHttpLikeSyncTransport()` 是当前 HTTP-like sync transport boundary：把 `deltaPush()` / `deltaPull()` / `listConflicts()` 映射到 API router 的 `/sync/delta/push`、`/sync/delta/pull` 与 `/sync/conflicts`。
- event catch-up transport boundary：`createHttpLikeSyncTransport()` can call `GET /sync/events`，`createHttpSyncTransport()` 也能通过 injected `fetch` 请求 `/sync/events`；this is sequence catch-up, not a WebSocket subscription。
- HTTP-like transport 非 2xx 错误会保留 route/status 与 body error，便于 Settings 与 `sync_state.lastError` 排查失败来源。
- `createHttpSyncTransport()` 定义真实 HTTP transport contract：通过 injected `fetch` 与 base URL 发送 JSON 请求，但当前不接默认 Settings 路径或生产 URL。
- HTTP transport 支持可选 headers provider 注入 auth/client headers；缺少 base URL 时会抛出 `HTTP sync baseUrl is not configured`，且不会调用 fetch。
- `createRemoteSyncConfig()` 读取远程同步配置对象：`VITE_MOMO_SYNC_BASE_URL` 生成 base URL，`VITE_MOMO_SYNC_TOKEN` 生成 Bearer headers provider；未配置 base URL 时返回 disabled 状态。
- `createRemoteSyncRunner()` 是 remote sync runner factory boundary：把 `RemoteSyncConfig`、repository、workspace/device、clock 与 injected `fetch` 组装成可运行的 `SyncRunner`；disabled config 返回 `runner: null`，enabled config 只产出 runner，不接入默认 Settings 路由。
- `createDefaultSettingsSyncRuntime()` 是 default settings sync runtime boundary：默认 `/settings` 只把远程配置用于只读展示，并继续把 `createLocalSyncRunner()` 的 `runOnce()` 注入为 `Local sync simulation`。
- `createLocalSyncRunner()` 使用 in-memory API router + HTTP-like sync transport 包装本地 `createSyncApi()`，并已接到 default Settings route，作为当前 local simulation entrypoint 让 `/settings` 中的演示按钮在实际桌面壳里可见。
- `createSyncRunner()` 是桌面端 sync runner boundary；`runOnce()` 接收注入的 `transport`、workspace/device 与 clock，负责编排一次同步并把 transport 错误归一成可展示结果。
- 当 transport 提供 `deltaPull()` 时，`runOnce()` runs delta pull after delta push：读取 `sync_state.serverCursor` 作为 `sinceCursor`，拉取并应用远端变化。
- runner 成功时会通过 `saveSyncState()` 保存 server cursor / last synced 并 clears last error；失败时会 records last error。
- runner 成功或失败后会 best-effort 写入 `sync_runs`，即使运行历史写入失败也不会遮蔽本次同步结果。
- 如果保存 `sync_state` 失败，runner 仍 does not hide the original sync error，页面会优先看到原始 transport / sync 失败原因。
- rejected changes 与 conflicts 目前只作为摘要返回给调用方，不会自动重试、覆盖或解决冲突。
- `SYNC_RUN_STATUSES` 固定导出同步运行状态列表；`summarizeDeltaPushResponse()` 会把一次 delta push 响应归纳成 `all-synced`、`has-rejections` 或 `has-conflicts` 状态文案；无变更时显示 `Already synced`。
- `summarizePendingConflicts()` 可把待处理冲突映射成只读展示摘要，保留 conflict/task/change id、原因、server task 标题/版本与 client payload 摘要。
- `summarizePendingConflictDetails()` 会把 pending conflicts 与当前 `Pending changes` 摘要按 `changeId` 关联。
- Settings 目前会在有冲突摘要时展示只读 `Sync conflicts` 列表占位，不提供解决按钮。
- Sync conflicts can show matching pending change action, entity, createdAt, and payload summary；如果本地 pending change 已不存在，仍保留原 conflict 摘要。
- Settings 也支持注入只读 `Sync status` 摘要，用于展示最近一次同步运行结果、计数和 cursor。
- Settings 在本地同步演示返回 rejected changes 时会展示只读 `Sync rejections` 卡片，显示 rejected change id 与 reason。
- `summarizeRejectedChanges()` 会把 rejected changes 与当前 `Pending changes` 摘要按 change id 关联。
- Sync rejections can show matching pending change action, entity, and payload summary；如果本地 pending change 已不存在，仍保留 rejected change id 与 reason。
- Rejected changes are read-only；当前不提供自动重试、删除、覆盖或强制标记 synced 操作。
- Settings 在本地同步演示返回 pull 结果时会展示只读 `Pull applied` 摘要：applied tasks、deleted tasks 和 pull cursor。
- Settings 会从本地 `sync_state` 读取并展示只读 `Sync state`，用于排查 cursor、最近同步时间和最近错误。
- Settings 会从本地 `sync_runs` 读取并展示只读 `Sync history`，当前调用 `listRecentSyncRuns(3)` 展示最近三次运行的 status、message、cursor、started/finished 时间。
- Sync history load errors do not hide Local database or Sync state；history 有自己的局部错误和 retry 入口。
- Settings 会展示只读 `Remote sync config`：未配置时显示 disabled reason，配置时显示 base URL 和 token configured 状态，不展示 token 原文。
- `Remote sync config` 中的 `Sync action` 固定显示 `Local simulation`，即使远程配置 enabled，当前按钮也仍只运行本地演示，不会切换到真实 HTTP。
- default `/settings` route reads `import.meta.env` through `createRemoteSyncConfig()` for display only；默认同步执行仍走本地 runner。
- `sync_state` 是当前本地 `cursor state boundary`，仍只保存同步游标和错误状态，不承担任务合并。
- Settings 可注入 `onRunLocalSyncSimulation` 显示 `Local sync simulation` 演示按钮；该按钮是 keyboard-accessible 的普通 button，只调用注入回调，不会自动连接真实网络。
- 本地同步演示成功后会重新读取 repository，并 refreshes `Sync state` 与 `Pending sync`，让 runner 写回后的 cursor / error / pending count 可见。
- 本地同步演示成功或失败后也会刷新 `Sync history`，让本次手动运行结果可追溯。
- 本地 sync errors refresh `Sync state` as well，所以 HTTP-like transport 或 runner 写回的 `lastError` 会显示在 Settings。
- 当前没有真实网络请求、账号、后台任务或定时同步；这些仍属于后续 BE-01 / BE-04 范围。
- `GET /sync/events` does not start a WebSocket server；默认 Settings route 仍只运行 local simulation，不订阅实时事件、不切换到远程 runner。

## Manual acceptance

- Local sync acceptance checklist: `docs/local-sync-acceptance.md`.
- BE-04 local-only boundary checklist: `docs/realtime-events-acceptance.md`，covering sequence catch-up, no WebSocket server, no Redis/event bus, no production backend, no notification delivery, and default Settings route stays on local simulation.
- 运行 `npm run dev`，打开 `http://localhost:1420/settings`。
- Remote config display smoke：用 `VITE_MOMO_SYNC_BASE_URL=https://api.example.test/momo` 与 `VITE_MOMO_SYNC_TOKEN=local-dev-token` 启动 Vite，只验证配置展示。
- confirm `Remote sync config` shows `enabled`，base URL 可见，token 只显示 configured，不显示 token 原文。
- confirm `Sync action` remains `Local simulation`；default button still uses local simulation，不会因为 env 存在而改走真实 HTTP。
- 在 Settings 中 click `Local sync simulation`。
- Vite smoke only verifies the route, button, and error handling；普通浏览器没有 Tauri SQL `invoke`，因此会显示本地插件不可用错误。
- Full SQLite success flow requires `npm run tauri dev`，在桌面壳中 click `Local sync simulation`。
- confirm `Sync status` 显示 `Already synced` 或本地变更同步结果。
- confirm `Pull applied` 显示 pull 应用的 applied / deleted / cursor 摘要。
- confirm `Sync state` 中的 cursor / last synced / last error 状态可见。
- 该检查使用 in-memory transport，no real network、账号、后台任务或生产同步。

## BE-03 local sync boundary

- The local BE-03 boundary is complete enough for desktop-only validation: push/pull adapters, cursor state, run history, pending change diagnostics, rejected/conflict visibility, remote config display, and local acceptance guardrails are all covered.
- Production sync still needs BE-01 / IF-01 production backend prerequisites before the desktop default can talk to a real service: identity, tenant storage, RLS/persistence, deployment, and operational policy.
- Next roadmap boundary: BE-04 realtime events can build on the existing contract and HTTP-like route semantics, but should still keep the default Settings route on local simulation until production backend prerequisites exist.
- BE-04 realtime events are currently contract and in-memory semantics only；这一阶段只固化 event envelope、sequence catch-up 和 HTTP-like `GET /sync/events`，does not start a WebSocket server、Redis/event bus 或生产后端。
- Continue to keep the default Settings route on local simulation; do not switch it to remote sync or background sync by configuration alone.

## 当前限制

- 登录是纯前端跳转占位，OIDC / Passkeys 接入对应后端任务 **BE-01**。
- 当前仅为桌面端本地 MVP，没有后端同步、协作、Agent 执行或 Android 端。
- Widget 窗口已在 `tauri.conf.json` 声明 `transparent / alwaysOnTop / decorations:false`，但还没有 Win32 扩展样式桥接（**NB-01**）来管理 `WS_EX_TOOLWINDOW / NOACTIVATE` 等。
- Rust 端仍保留 `greet` 命令作为 Tauri invoke smoke test，但主页面不再展示该调试入口。
