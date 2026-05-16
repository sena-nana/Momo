# Momo · Desktop (Tauri 2 + React + TypeScript)

桌面端本地 MVP。当前完成了 Tauri 2 + React + TypeScript 壳、本地 SQLite 任务存储、Today / Inbox / Calendar / Settings 四个主页面、widget 窗口，以及后续同步使用的共享 contract 骨架。

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
- 当前 schema 包含 `schema_migrations`、`tasks`、`local_changes` 与 `sync_state`；`tags` 以 JSON text 存储，时间统一保存 ISO 字符串。
- `Today` 支持快速添加今日或 Inbox 任务、查看逾期/今日/今日完成；`Inbox` 支持编辑、完成、删除无截止日期任务；`Calendar` 先提供未来 7 天只读 agenda。
- `local_changes` 记录本地 create / update / status / delete 变更，为后续 Delta Sync 使用。
- `Settings` 的 Local database 卡片显示 `Pending sync`，即尚未标记 synced 的本地变更数量。
- `TaskRepository.getSyncState()` / `saveSyncState()` 读写本地同步状态：最新 server cursor、最近同步时间、最近错误与状态更新时间。

## 共享契约

- `packages/contracts` 定义 Task DTO、LocalChange DTO、Delta Push/Pull 请求响应类型。
- 当前仅做纯 TypeScript contract，不接生产后端、不实现 OIDC / PostgreSQL / WebSocket。

## 本地同步前置层

- `buildDeltaPushFromPendingChanges()` 从 `TaskRepository.listPendingChanges()` 构造 `DeltaPushRequest`。
- `applyDeltaPushResponse()` 会把服务端 accepted change ids 通过 `TaskRepository.markChangeSynced()` 标记为已同步。
- `runLocalSyncSimulation()` 可用注入的内存 sync API 串起 pending changes、delta push、accepted 标记与 pending conflict 摘要，用于本地端到端演练；返回值包含 `pendingConflictCount`。
- `createLocalSyncRunner()` 使用 in-memory transport 包装本地 `createSyncApi()`，并已接到 default Settings route，作为当前 local simulation entrypoint 让 `/settings` 中的演示按钮在实际桌面壳里可见。
- `createSyncRunner()` 是桌面端 sync runner boundary；`runOnce()` 接收注入的 `transport`、workspace/device 与 clock，负责编排一次同步并把 transport 错误归一成可展示结果。
- runner 成功时会通过 `saveSyncState()` 保存 server cursor / last synced 并 clears last error；失败时会 records last error。
- rejected changes 与 conflicts 目前只作为摘要返回给调用方，不会自动重试、覆盖或解决冲突。
- `SYNC_RUN_STATUSES` 固定导出同步运行状态列表；`summarizeDeltaPushResponse()` 会把一次 delta push 响应归纳成 `all-synced`、`has-rejections` 或 `has-conflicts` 状态文案；无变更时显示 `Already synced`。
- `summarizePendingConflicts()` 可把待处理冲突映射成只读展示摘要，保留 conflict/task/change id、原因、server task 标题/版本与 client payload 摘要。
- Settings 目前会在有冲突摘要时展示只读 `Sync conflicts` 列表占位，不提供解决按钮。
- Settings 也支持注入只读 `Sync status` 摘要，用于展示最近一次同步运行结果、计数和 cursor。
- Settings 会从本地 `sync_state` 读取并展示只读 `Sync state`，用于排查 cursor、最近同步时间和最近错误。
- `sync_state` 是当前本地 `cursor state boundary`，仍只保存同步游标和错误状态，不承担任务合并。
- Settings 可注入 `onRunLocalSyncSimulation` 显示 `Local sync simulation` 演示按钮；该按钮是 keyboard-accessible 的普通 button，只调用注入回调，不会自动连接真实网络。
- 当前没有真实网络请求、账号、后台任务或定时同步；这些仍属于后续 BE-01 / BE-03 范围。

下一轮建议做手动验收说明和开发态检查：启动 `/settings`，点击 `Local sync simulation`，确认 `sync_state` 和 `Sync status` 刷新；仍先不接真实网络层。

## Manual acceptance

- 运行 `npm run dev`，打开 `http://localhost:1420/settings`。
- 在 Settings 中 click `Local sync simulation`。
- Vite smoke only verifies the route, button, and error handling；普通浏览器没有 Tauri SQL `invoke`，因此会显示本地插件不可用错误。
- Full SQLite success flow requires `npm run tauri dev`，在桌面壳中 click `Local sync simulation`。
- confirm `Sync status` 显示 `Already synced` 或本地变更同步结果。
- confirm `Sync state` 中的 cursor / last synced / last error 状态可见。
- 该检查使用 in-memory transport，no real network、账号、后台任务或生产同步。

## 当前限制

- 登录是纯前端跳转占位，OIDC / Passkeys 接入对应后端任务 **BE-01**。
- 当前仅为桌面端本地 MVP，没有后端同步、协作、Agent 执行或 Android 端。
- Widget 窗口已在 `tauri.conf.json` 声明 `transparent / alwaysOnTop / decorations:false`，但还没有 Win32 扩展样式桥接（**NB-01**）来管理 `WS_EX_TOOLWINDOW / NOACTIVATE` 等。
- Rust 端仍保留 `greet` 命令作为 Tauri invoke smoke test，但主页面不再展示该调试入口。
