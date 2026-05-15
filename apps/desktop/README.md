# Momo · Desktop (Tauri 2 + React + TypeScript)

桌面端最小可运行壳。对应设计文档任务 **CL-01 共享 UI 骨架** 与 **CL-03 Windows 浮窗壳** 的初始位（widget 窗口已在 `tauri.conf.json` 中预声明，尚未驱动）。

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
| `npm run build` | TypeScript 检查 + Vite 生产构建 |
| `npm run tauri dev` | 启动 Tauri 桌面壳（带 WebView 窗口） |
| `npm run tauri build` | 打包 Windows 安装器 |
| `cargo check`（在 `src-tauri/`） | 仅校验 Rust 端是否能编译 |

## 路由

`/login`, `/today`, `/inbox`, `/calendar`, `/settings`，根路径自动跳 `/today`。

## 当前限制

- 登录是纯前端跳转占位，OIDC / Passkeys 接入对应后端任务 **BE-01**。
- 没有任何持久化，本地 SQLite 层对应 **CL-02**。
- Widget 窗口已在 `tauri.conf.json` 声明 `transparent / alwaysOnTop / decorations:false`，但还没有 Win32 扩展样式桥接（**NB-01**）来管理 `WS_EX_TOOLWINDOW / NOACTIVATE` 等。
- `Today` 页演示了 Tauri ↔ React 的 `invoke("greet")` 通路，作为前后端贯通的 smoke test。
