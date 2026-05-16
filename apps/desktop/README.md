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

## 路由

`/login`, `/today`, `/inbox`, `/calendar`, `/settings`, `/widget`，根路径自动跳 `/today`。

## 本地数据

- SQLite 由 `@tauri-apps/plugin-sql` / `tauri-plugin-sql` 提供，连接固定为 `sqlite:momo.db`。
- 前端通过 `TaskRepository` 访问数据，页面不直接写 SQL。
- 当前 schema 包含 `schema_migrations`、`tasks` 与 `local_changes`；`tags` 以 JSON text 存储，时间统一保存 ISO 字符串。
- `Today` 支持快速添加今日或 Inbox 任务、查看逾期/今日/今日完成；`Inbox` 支持编辑、完成、删除无截止日期任务；`Calendar` 先提供未来 7 天只读 agenda。
- `local_changes` 记录本地 create / update / status / delete 变更，为后续 Delta Sync 使用。

## 共享契约

- `packages/contracts` 定义 Task DTO、LocalChange DTO、Delta Push/Pull 请求响应类型。
- 当前仅做纯 TypeScript contract，不接生产后端、不实现 OIDC / PostgreSQL / WebSocket。

## 当前限制

- 登录是纯前端跳转占位，OIDC / Passkeys 接入对应后端任务 **BE-01**。
- 当前仅为桌面端本地 MVP，没有后端同步、协作、Agent 执行或 Android 端。
- Widget 窗口已在 `tauri.conf.json` 声明 `transparent / alwaysOnTop / decorations:false`，但还没有 Win32 扩展样式桥接（**NB-01**）来管理 `WS_EX_TOOLWINDOW / NOACTIVATE` 等。
- Rust 端仍保留 `greet` 命令作为 Tauri invoke smoke test，但主页面不再展示该调试入口。
