# 中文文本与注释开发规范设计

## 背景

Momo 当前已经以中文规划文档为主，但桌面端页面、README、验收文档、测试断言和少量源码注释仍混有英文。后续开发如果继续混用，会让界面、诊断信息和文档维护风格漂移。

## 目标

- 将页面可见文本、文档、测试描述、测试断言、源码注释统一切换为中文。
- 将会展示到 UI、诊断卡片或运行摘要中的内部 message、reason、error 文案尽量切换为中文。
- 把中文文本要求写入仓库级开发规范，作为后续开发默认规则。

## 非目标

- 不重命名代码标识符、类型名、函数名、文件名、路由、环境变量、DTO 字段和协议枚举。
- 不翻译依赖包名、技术栈名称、外部 API 名和标准协议名。
- 不借中文化机会重构业务逻辑、同步协议或 UI 结构。

## 范围

本次变更覆盖以下内容：

- `apps/desktop/src/**/*.vue` 中的页面标题、按钮、占位符、空状态、加载态、错误前缀和辅助标签。
- `apps/desktop/src/**/*.ts`、`apps/api/src/**/*.ts`、`packages/contracts/src/**/*.ts` 中明确会被展示或记录为诊断摘要的文案。
- 测试文件中的用例标题、断言目标文本和与 README 内容对应的期望文本。
- `apps/desktop/README.md`、`apps/api/README.md`、`apps/desktop/docs/*.md` 等项目文档。
- 仓库级 `AGENTS.md` 开发规范。

## 文案边界

保留英文的内容包括：

- 代码标识符：例如 `TaskRepository`、`createSyncRunner()`、`SyncRunStatus`。
- 外部契约字段：例如 `serverCursor`、`baseVersion`、`workspaceId`。
- 路由、命令和配置：例如 `/sync/events`、`npm run verify`、`VITE_MOMO_SYNC_BASE_URL`。
- 枚举值和协议值：例如 `task.changed`、`conflict.raised`、`has-conflicts`。
- 技术名和产品名：例如 `Tauri`、`Vue`、`TypeScript`、`SQLite`、`WebSocket`。

当英文技术名直接面向用户时，可保留英文并补充中文语境，例如“本地同步模拟”“WebSocket 订阅尚未接入”。

## 开发规范设计

新增 `AGENTS.md`，约束后续开发：

- 新增或修改的页面文本、注释、测试描述、测试断言和文档默认使用中文。
- 面向用户或操作者可见的运行摘要、错误提示和诊断信息默认使用中文。
- 工程标识符和外部协议字段保持英文，不为中文化而破坏类型或契约。
- 确需英文原文时，应提供中文说明或处于命令、字段、协议值等明确工程语境中。

## 测试策略

- 更新受文案影响的页面测试、README 测试和 API README 测试。
- 运行桌面端测试，确认页面查询和文档断言都已同步。
- 根据改动范围运行根目录验证命令或对应 TypeScript 检查。

## 风险与处理

- 文案断言较多，容易出现遗漏；通过全文搜索英文页面词、注释和 README 断言逐轮收敛。
- 内部 message 如果被测试或文档引用，需要同步更新断言。
- 不修改协议枚举值，避免影响 contracts、API router 和同步层兼容性。
