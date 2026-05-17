# Momo · Desktop（Tauri 2 + Vue 3 + TypeScript）

桌面端本地 MVP。当前完成了 Tauri 2 + Vue 3 + TypeScript 壳、本地 SQLite 任务存储、今日 / 收件箱 / 日历 / 设置四个主页面、小组件窗口，以及后续同步使用的共享契约骨架。

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
| `.\apps\desktop\node_modules\.bin\tsc.cmd -p packages\contracts\tsconfig.json`（在仓库根目录） | 校验共享契约包 |
| `npm run verify`（在仓库根目录） | 串行运行桌面端测试与构建、Tauri 检查、contracts/API TypeScript 检查 |

## 路由

`/login`, `/today`, `/inbox`, `/calendar`, `/settings`, `/widget`，根路径自动跳 `/today`。

## 本地数据

- SQLite 由 `@tauri-apps/plugin-sql` / `tauri-plugin-sql` 提供，连接固定为 `sqlite:momo.db`。
- 前端通过 `TaskRepository` 访问数据，页面不直接写 SQL。
- 当前 schema 包含 `schema_migrations`、`tasks`、`local_changes`、`sync_state`、`sync_runs` 与 `task_sync_versions`；`tags` 以 JSON text 存储，时间统一保存 ISO 字符串。
- 今日页支持快速添加今日或收件箱任务、查看逾期/今日/今日完成；收件箱页支持编辑、完成、删除无截止日期任务；日历页先提供未来 7 天只读日程。
- `local_changes` 记录本地 create / update / status / delete 变更，为后续 Delta Sync 使用。
- 设置页的本地数据库卡片显示 `待同步`，即尚未标记为 synced 的本地变更数量。
- `TaskRepository.getSyncState()` / `saveSyncState()` 读写本地同步状态：最新 server cursor、最近同步时间、最近错误与状态更新时间。
- `TaskRepository.recordSyncRun()` / `listRecentSyncRuns()` 维护同步运行历史：记录每次手动同步演示的成功/失败、开始/结束时间、message 与 cursor，作为设置页后续可见性的本地边界。
- `task_sync_versions` 保存远端 task version，`applyRemoteTask(task, remoteVersion)` 在 pull 应用时更新该基线，不把 version 泄进通用 Task UI 模型。
- 本地 `updateTask()` / `setStatus()` 记录 `local_changes` 时，如果存在远端版本，会把 `baseVersion` 写入 payload，用于后续 Delta Sync 冲突检测。
- `summarizePendingLocalChanges()` 可把待同步本地变更映射为只读摘要：change id、entity label、action、createdAt 和 payload 摘要。
- `summarizeSyncEvents()` 可把实时事件补拉结果映射为只读摘要；`fetchRealtimeEventCatchUp()` 只调用可选 `transport.listEvents()`，缺失时返回“实时事件补拉不可用”，不会触发同步运行。
- 设置页会从 `TaskRepository.listPendingChanges()` 读取待同步本地变更，展示只读“待同步变更”卡片。
- 待同步变更加载失败不会遮蔽本地数据库、同步状态或同步历史；该失败只影响局部卡片和“重试待同步变更”。
- 本地同步演示成功或失败后也会刷新待同步变更，让本地队列变化可追溯。

## 共享契约

- `packages/contracts` 定义 Task DTO、LocalChange DTO、Delta Push/Pull 请求响应类型。
- BE-04 实时事件当前只实现契约与内存语义：`SyncEventDto`、`createListSyncEventsRequest()` 与 HTTP-like `GET /sync/events` 只验证按 sequence 补拉。
- 同步生成的实时事件仍只存在于内存边界：已接受的任务变更发布 `task.changed`，冲突发布 `conflict.raised`，被拒绝的变更不会发布 `task.changed`。
- BE-11 Notification 骨架当前只实现本地通知队列语义：`NotificationDto`、`createListNotificationsRequest()` 与 `createAcknowledgeNotificationRequest()` 只定义队列和确认回执契约。
- `createNotificationApi()` / `createInMemoryNotificationStore()` 只在 API 骨架中维护内存通知队列；当前不做 push delivery、不做 email delivery、不做 in-app delivery channel、不启动 background worker。
- 通知事件投影边界：`projectSyncEventToNotification()` / `enqueueNotificationsFromSyncEvents()` 只把 `conflict.raised` 或 failed `sync.run.updated` 转成通知队列输入；这是队列来源边界，不是通知投递，也不是订阅。
- 当前仅做纯 TypeScript 契约，不接生产后端、不实现 OIDC / PostgreSQL / WebSocket。

## 本地同步前置层

- `buildDeltaPushFromPendingChanges()` 从 `TaskRepository.listPendingChanges()` 构造 `DeltaPushRequest`。
- `applyDeltaPushResponse()` 会把服务端 accepted change ids 通过 `TaskRepository.markChangeSynced()` 标记为已同步。
- `applyDeltaPullResponse()` 会把 delta pull 结果应用到本地 SQLite：`applyRemoteTask()` upsert 远端任务，`deleteRemoteTask()` 删除远端已删除任务，并更新 `sync_state.serverCursor`。
- 远端 pull 应用不会记录本地变更：`applyRemoteTask()` / `deleteRemoteTask()` 会修改 `tasks`，但不会写入 `local_changes`。
- `runLocalSyncSimulation()` 可用注入的内存 sync API 串起 pending changes、delta push、accepted 标记与 pending conflict 摘要，用于本地端到端演练；返回值包含 `pendingConflictCount`。
- `createHttpLikeSyncTransport()` 是当前 HTTP-like 同步 transport 边界：把 `deltaPush()` / `deltaPull()` / `listConflicts()` 映射到 API router 的 `/sync/delta/push`、`/sync/delta/pull` 与 `/sync/conflicts`。
- 事件补拉 transport 边界：`createHttpLikeSyncTransport()` 可以调用 `GET /sync/events`，`createHttpSyncTransport()` 也能通过注入的 `fetch` 请求 `/sync/events`；这是 sequence 补拉，不是 WebSocket 订阅。
- HTTP-like transport 的非 2xx 错误会保留 route/status 与 body error，便于设置页与 `sync_state.lastError` 排查失败来源。
- `createHttpSyncTransport()` 定义真实 HTTP transport 契约：通过注入的 `fetch` 与 base URL 发送 JSON 请求，但当前不接默认设置页路径或生产 URL。
- HTTP transport 支持可选 headers provider 注入 auth/client headers；缺少 base URL 时会抛出“未配置 HTTP 同步 baseUrl”，且不会调用 fetch。
- `createRemoteSyncConfig()` 读取远程同步配置对象：`VITE_MOMO_SYNC_BASE_URL` 生成 base URL，`VITE_MOMO_SYNC_TOKEN` 生成 Bearer headers provider；未配置 base URL 时返回 disabled 状态。
- `createRemoteSyncRunner()` 是远程同步 runner 工厂边界：把 `RemoteSyncConfig`、repository、workspace/device、clock 与注入的 `fetch` 组装成可运行的 `SyncRunner`；disabled config 返回 `runner: null`，enabled config 只产出 runner，不接入默认设置页路由。
- `createDefaultSettingsSyncRuntime()` 是默认设置页同步运行时边界：默认 `/settings` 只把远程配置用于只读展示，并继续把 `createLocalSyncRunner()` 的 `runOnce()` 注入为“本地同步模拟”。
- `createLocalSyncRunner()` 使用内存 API router + HTTP-like sync transport 包装本地 `createSyncApi()`，并已接到默认设置页路由，作为当前本地模拟入口让 `/settings` 中的演示按钮在实际桌面壳里可见。
- `createSyncRunner()` 是桌面端同步 runner 边界；`runOnce()` 接收注入的 `transport`、workspace/device 与 clock，负责编排一次同步并把 transport 错误归一成可展示结果。
- 当 transport 提供 `deltaPull()` 时，`runOnce()` 会在 delta push 后运行 delta pull：读取 `sync_state.serverCursor` 作为 `sinceCursor`，拉取并应用远端变化。
- runner 成功时会通过 `saveSyncState()` 保存 server cursor / last synced 并清除 last error；失败时会记录 last error。
- runner 成功或失败后会尽力写入 `sync_runs`，即使运行历史写入失败也不会遮蔽本次同步结果。
- 如果保存 `sync_state` 失败，runner 仍不会遮蔽原始同步错误，页面会优先看到原始 transport / sync 失败原因。
- rejected changes 与 conflicts 目前只作为摘要返回给调用方，不会自动重试、覆盖或解决冲突。
- `SYNC_RUN_STATUSES` 固定导出同步运行状态列表；`summarizeDeltaPushResponse()` 会把一次 delta push 响应归纳成 `all-synced`、`has-rejections` 或 `has-conflicts` 状态文案；无变更时显示“已完成同步”。
- `summarizePendingConflicts()` 可把待处理冲突映射成只读展示摘要，保留 conflict/task/change id、原因、server task 标题/版本与 client payload 摘要。
- `summarizePendingConflictDetails()` 会把 pending conflicts 与当前待同步变更摘要按 `changeId` 关联。
- 设置页目前会在有冲突摘要时展示只读“同步冲突”列表占位，不提供解决按钮。
- 同步冲突可以展示匹配的待同步变更 action、entity、createdAt 与 payload 摘要；如果本地 pending change 已不存在，仍保留原 conflict 摘要。
- 设置页也支持注入只读“同步状态”摘要，用于展示最近一次同步运行结果、计数和 cursor。
- 设置页在本地同步演示返回 rejected changes 时会展示只读“同步拒绝”卡片，显示 rejected change id 与 reason。
- `summarizeRejectedChanges()` 会把 rejected changes 与当前待同步变更摘要按 change id 关联。
- 同步拒绝可以展示匹配的待同步变更 action、entity 与 payload 摘要；如果本地 pending change 已不存在，仍保留 rejected change id 与 reason。
- 被拒绝变更是只读诊断；当前不提供自动重试、删除、覆盖或强制标记 synced 操作。
- 设置页在本地同步演示返回 pull 结果时会展示只读“已应用拉取结果”摘要：applied tasks、deleted tasks 和 pull cursor。
- 设置页会从本地 `sync_state` 读取并展示只读“同步状态”，用于排查 cursor、最近同步时间和最近错误。
- 设置页会从本地 `sync_runs` 读取并展示只读“同步历史”，当前调用 `listRecentSyncRuns(3)` 展示最近三次运行的 status、message、cursor、started/finished 时间。
- 同步历史加载失败不会遮蔽本地数据库或同步状态；history 有自己的局部错误和 retry 入口。
- 设置页会展示只读“远程同步配置”：未配置时显示 disabled reason，配置时显示 base URL 和 token configured 状态，不展示 token 原文。
- “远程同步配置”中的“同步动作”固定显示“本地模拟”，即使远程配置 enabled，当前按钮也仍只运行本地演示，不会切换到真实 HTTP。
- 默认 `/settings` 路由通过 `createRemoteSyncConfig()` 读取 `import.meta.env` 且仅用于展示；默认同步执行仍走本地 runner。
- `sync_state` 是当前本地 cursor 状态边界，仍只保存同步游标和错误状态，不承担任务合并。
- 设置页可注入 `onRunLocalSyncSimulation` 显示“本地同步模拟”演示按钮；该按钮是可键盘访问的普通 button，只调用注入回调，不会自动连接真实网络。
- 本地同步演示成功后会重新读取 repository，并刷新同步状态与待同步数量，让 runner 写回后的 cursor / error / pending count 可见。
- 本地同步演示成功或失败后也会刷新同步历史，让本次手动运行结果可追溯。
- 本地同步错误也会刷新同步状态，所以 HTTP-like transport 或 runner 写回的 `lastError` 会显示在设置页。
- 当前没有真实网络请求、账号、后台任务或定时同步；这些仍属于后续 BE-01 / BE-04 范围。
- `GET /sync/events` 不会启动 WebSocket server；默认设置页路由仍只运行本地模拟，不订阅实时事件、不切换到远程 runner。

## 手动验收

- 本地同步验收清单：`docs/local-sync-acceptance.md`。
- BE-04 本地边界验收清单：`docs/realtime-events-acceptance.md`，覆盖 sequence 补拉、不启动 WebSocket server、不接 Redis/event bus、不接生产后端、不做通知投递，且默认设置页路由保持在本地模拟。
- BE-11 本地边界验收清单：`docs/notification-acceptance.md`，覆盖本地通知队列、不做投递渠道、不接生产后端，且默认设置页不展示通知。
- 运行 `npm run dev`，打开 `http://localhost:1420/settings`。
- 远程配置展示冒烟：用 `VITE_MOMO_SYNC_BASE_URL=https://api.example.test/momo` 与 `VITE_MOMO_SYNC_TOKEN=local-dev-token` 启动 Vite，只验证配置展示。
- 确认“远程同步配置”显示 enabled，base URL 可见，token 只显示 configured，不显示 token 原文。
- 确认“同步动作”仍为“本地模拟”；默认按钮仍使用本地模拟，不会因为 env 存在而改走真实 HTTP。
- 在设置页点击“本地同步模拟”。
- Vite 冒烟只验证路由、按钮和错误处理；普通浏览器没有 Tauri SQL `invoke`，因此会显示本地插件不可用错误。
- 完整 SQLite 成功流程需要 `npm run tauri dev`，在桌面壳中点击“本地同步模拟”。
- 确认“同步状态”显示“已完成同步”或本地变更同步结果。
- 确认“已应用拉取结果”显示 pull 应用的 applied / deleted / cursor 摘要。
- 确认“同步状态”中的 cursor / last synced / last error 状态可见。
- 该检查使用内存 transport，不发起真实网络、不接账号、不启动后台任务或生产同步。

## BE-03 本地同步边界

- 本地 BE-03 边界已经足够支撑桌面端本地验证：push/pull 适配器、cursor 状态、运行历史、待同步变更诊断、拒绝/冲突可见性、远程配置展示和本地验收护栏均已覆盖。
- 生产同步仍需要 BE-01 / IF-01 生产后端前置条件，桌面端默认流程才能接入真实服务：身份、租户存储、RLS/持久化、部署和运维策略。
- 下一条路线图边界是 BE-04 实时事件，可以基于现有契约与 HTTP-like route 语义推进，但在生产后端前置条件完成前，默认设置页路由仍应保持在本地模拟。
- BE-04 实时事件当前只实现契约与内存语义；这一阶段只固化 event envelope、sequence 补拉和 HTTP-like `GET /sync/events`，不会启动 WebSocket server、Redis/event bus 或生产后端。
- 继续保持默认设置页路由使用本地模拟；不要仅凭配置把它切换到远程同步或后台同步。

## 当前限制

- 登录是纯前端跳转占位，OIDC / Passkeys 接入对应后端任务 **BE-01**。
- 当前仅为桌面端本地 MVP，没有后端同步、协作、Agent 执行或 Android 端。
- 小组件窗口已在 `tauri.conf.json` 声明 `transparent / alwaysOnTop / decorations:false`，但还没有 Win32 扩展样式桥接（**NB-01**）来管理 `WS_EX_TOOLWINDOW / NOACTIVATE` 等。
- Rust 端仍保留 `greet` 命令作为 Tauri invoke 冒烟测试，但主页面不再展示该调试入口。
