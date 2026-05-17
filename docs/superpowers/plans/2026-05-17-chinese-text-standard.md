# 中文文本规范实施计划

> **给执行代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标：** 将 Momo 的注释、页面文本、文档、测试描述和可见运行文案统一切换为中文，并写入后续开发规范。

**架构：** 先新增仓库级开发规范，再以测试驱动方式更新会被 UI 或诊断摘要消费的运行文案。随后同步 Vue 页面文案、README/验收文档和测试断言，最后用测试与全文搜索收敛遗漏。

**技术栈：** Vue 3、TypeScript、Vitest、Tauri 2、Markdown。

---

### 任务 1：仓库级中文文本规范

**文件：**
- 新增：`AGENTS.md`
- 测试：`apps/desktop/tests/tooling.test.ts`

- [ ] **Step 1: 写入失败测试**

在 `apps/desktop/tests/tooling.test.ts` 增加测试，确认根目录 `AGENTS.md` 包含中文文本规范关键词。

```ts
it("记录中文文本开发规范", () => {
  const standard = readFileSync(resolve(workspaceRoot, "AGENTS.md"), "utf-8");

  expect(standard).toContain("中文文本开发规范");
  expect(standard).toContain("页面文本、注释、测试描述、测试断言和文档默认使用中文");
  expect(standard).toContain("工程标识符、外部协议字段、路由、命令和环境变量保持英文");
});
```

- [ ] **Step 2: 运行测试确认失败**

运行：`npm --prefix apps/desktop run test -- tooling.test.ts`

预期：FAIL，原因是 `AGENTS.md` 尚不存在或缺少中文规范。

- [ ] **Step 3: 新增规范文件**

创建 `AGENTS.md`，写入以下内容：

```md
# Momo 开发规范

## 中文文本开发规范

- 页面文本、注释、测试描述、测试断言和文档默认使用中文。
- 面向用户、开发者或操作者可见的运行摘要、错误提示、诊断信息和验收说明默认使用中文。
- 工程标识符、外部协议字段、路由、命令和环境变量保持英文。
- 依赖名、技术栈名、产品名和标准协议名可保留英文；直接面向用户时应放在中文语境中说明。
- 不为中文化重命名类型、函数、DTO 字段、枚举值或持久化字段。
- 如需保留英文原文，应确保它属于命令、字段、协议值、外部技术名或测试夹具数据。
```

- [ ] **Step 4: 运行测试确认通过**

运行：`npm --prefix apps/desktop run test -- tooling.test.ts`

预期：PASS。

### 任务 2：可见运行文案中文化

**文件：**
- 修改：`apps/api/src/tasks.ts`
- 修改：`apps/api/src/router.ts`
- 修改：`apps/api/src/index.ts`
- 修改：`apps/desktop/src/sync/remoteSyncConfig.ts`
- 修改：`apps/desktop/src/sync/syncClient.ts`
- 测试：`apps/desktop/tests/apiTasks.test.ts`
- 测试：`apps/desktop/tests/apiRouter.test.ts`
- 测试：`apps/desktop/tests/apiSync.test.ts`
- 测试：`apps/desktop/tests/desktopSyncClient.test.ts`
- 测试：`apps/desktop/tests/tasks.test.ts`

- [ ] **Step 1: 写入失败测试**

更新测试断言中的英文错误和摘要，例如：

```ts
await expect(service.updateTask(actor, "missing", {})).rejects.toThrow("任务不存在");
expect(summary.message).toBe("已完成同步");
expect(config.reason).toBe("未配置远程同步 base URL");
expect(notification.title).toBe("同步冲突需要处理");
```

- [ ] **Step 2: 运行相关测试确认失败**

运行：`npm --prefix apps/desktop run test -- apiTasks.test.ts apiRouter.test.ts apiSync.test.ts desktopSyncClient.test.ts tasks.test.ts`

预期：FAIL，原因是生产代码仍返回英文错误或摘要。

- [ ] **Step 3: 更新生产文案**

将会进入 UI、API 错误响应、通知标题、同步摘要或诊断信息的字符串改为中文，保持枚举值和协议字段不变。目标映射包括：

```ts
"Task not found" -> "任务不存在"
"Actor cannot write tasks" -> "当前操作者不能写入任务"
"Task title is required" -> "任务标题不能为空"
"Task date must be a valid ISO date" -> "任务时间必须是有效的 ISO 日期"
"Task estimate must be a positive integer" -> "任务估时必须是正整数"
"Task priority must be between 0 and 3" -> "任务优先级必须在 0 到 3 之间"
"Sync event API not configured" -> "未配置同步事件 API"
"Notification API not configured" -> "未配置通知 API"
"Notification id mismatch" -> "通知 id 不匹配"
"Missing actor headers" -> "缺少操作者请求头"
"Invalid actor role" -> "操作者角色无效"
"Invalid JSON body" -> "JSON 请求体无效"
"Notification not found" -> "通知不存在"
"Unsupported entity type" -> "不支持的实体类型"
"Conflict not found" -> "冲突不存在"
"Unsupported sync contract version" -> "不支持的同步契约版本"
"Already synced" -> "已完成同步"
"Realtime event catch-up is not available" -> "实时事件补拉不可用"
```

通知标题改为：

```ts
"Sync conflict needs review" -> "同步冲突需要处理"
"Sync failed" -> "同步失败"
```

同步摘要 message 改为中文：

```ts
`${conflictCount} sync conflict...` -> `${conflictCount} 个同步冲突需要处理`
`${rejectedCount} local change... rejected` -> `${rejectedCount} 个本地变更被拒绝`
`${acceptedCount} local change... synced` -> `已同步 ${acceptedCount} 个本地变更`
```

- [ ] **Step 4: 运行相关测试确认通过**

运行：`npm --prefix apps/desktop run test -- apiTasks.test.ts apiRouter.test.ts apiSync.test.ts desktopSyncClient.test.ts tasks.test.ts`

预期：PASS。

### 任务 3：桌面端页面文本中文化

**文件：**
- 修改：`apps/desktop/src/layouts/AppShell.vue`
- 修改：`apps/desktop/src/pages/Calendar.vue`
- 修改：`apps/desktop/src/pages/Inbox.vue`
- 修改：`apps/desktop/src/pages/Login.vue`
- 修改：`apps/desktop/src/pages/Settings.vue`
- 修改：`apps/desktop/src/pages/Today.vue`
- 修改：`apps/desktop/src/pages/Widget.vue`
- 测试：`apps/desktop/tests/pages.test.ts`

- [ ] **Step 1: 写入失败测试**

将 `apps/desktop/tests/pages.test.ts` 中面向页面文本的查询和断言改为中文，例如：

```ts
expect(await screen.findByText("今日")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "打开小组件" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "运行本地同步模拟" })).toBeInTheDocument();
expect(screen.getByText("远程同步配置")).toBeInTheDocument();
```

- [ ] **Step 2: 运行页面测试确认失败**

运行：`npm --prefix apps/desktop run test -- pages.test.ts`

预期：FAIL，原因是 Vue 页面仍显示英文。

- [ ] **Step 3: 更新 Vue 页面文案**

将页面标题、按钮、占位符、加载态、空状态、错误前缀、辅助标签和设置卡片字段切换为中文。保留任务夹具标题、技术名、URL、命令和枚举值。

重点映射包括：

```txt
Today -> 今日
Inbox -> 收件箱
Calendar -> 日历
Settings -> 设置
Momo Widget -> Momo 小组件
Open widget -> 打开小组件
Quick add task -> 快速添加任务
Add a task for today -> 添加今日任务
Add for today -> 添加到今日
Add task -> 添加任务
Loading local tasks... -> 正在加载本地任务...
Retry -> 重试
Nothing here. -> 暂无内容。
Overdue -> 已逾期
Due today -> 今日到期
Completed today -> 今日完成
Local database -> 本地数据库
Pending changes -> 待同步变更
Sync history -> 同步历史
Remote sync config -> 远程同步配置
Local sync simulation -> 本地同步模拟
Run local sync simulation -> 运行本地同步模拟
Sync conflicts -> 同步冲突
Sync status -> 同步状态
Sync rejections -> 同步拒绝
Pull applied -> 已应用拉取结果
```

- [ ] **Step 4: 运行页面测试确认通过**

运行：`npm --prefix apps/desktop run test -- pages.test.ts`

预期：PASS。

### 任务 4：文档和验收清单中文化

**文件：**
- 修改：`apps/api/README.md`
- 修改：`apps/desktop/README.md`
- 修改：`apps/desktop/docs/local-sync-acceptance.md`
- 修改：`apps/desktop/docs/realtime-events-acceptance.md`
- 测试：`apps/desktop/tests/apiReadme.test.ts`
- 测试：`apps/desktop/tests/readme.test.ts`
- 测试：`apps/desktop/tests/localSyncAcceptance.test.ts`
- 测试：`apps/desktop/tests/realtimeEventsAcceptance.test.ts`

- [ ] **Step 1: 写入失败测试**

更新 README 和验收清单测试中的章节名与说明断言，例如：

```ts
expect(readme).toContain("同步可见性范围");
expect(readme).toContain("实时事件范围");
expect(readme).toContain("通知范围");
expect(checklist).toContain("打开 `http://localhost:1420/settings`");
```

- [ ] **Step 2: 运行文档测试确认失败**

运行：`npm --prefix apps/desktop run test -- apiReadme.test.ts readme.test.ts localSyncAcceptance.test.ts realtimeEventsAcceptance.test.ts`

预期：FAIL，原因是文档仍包含英文标题或说明。

- [ ] **Step 3: 更新文档**

将 README 与验收清单中的自然语言说明切换为中文。保留命令、URL、配置名、路由、字段和协议值。

- [ ] **Step 4: 运行文档测试确认通过**

运行：`npm --prefix apps/desktop run test -- apiReadme.test.ts readme.test.ts localSyncAcceptance.test.ts realtimeEventsAcceptance.test.ts`

预期：PASS。

### 任务 5：测试描述和源码注释中文化

**文件：**
- 修改：`apps/desktop/tests/*.ts`
- 修改：`apps/desktop/vite.config.ts`
- 修改：`apps/desktop/src-tauri/src/lib.rs`
- 修改：`apps/desktop/src-tauri/src/main.rs`
- 修改：`apps/desktop/src/sync/syncClient.ts`

- [ ] **Step 1: 更新测试描述**

将 `describe()`、`it()`、`test()` 的自然语言描述改成中文。保留测试夹具数据、协议值、字段名、SQL、URL 和命令。

- [ ] **Step 2: 更新源码注释**

将项目源码注释改成中文，例如：

```ts
// Sync history is diagnostic only; do not hide the primary sync outcome.
// 同步历史仅用于诊断，不应遮蔽本次同步的主要结果。
```

```rs
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// 防止 Windows release 构建额外弹出控制台窗口，请勿移除。
```

- [ ] **Step 3: 运行全文搜索**

运行：`rg -n "documents|shows|routes|returns|keeps|loads|sync-generated|local-only|without|not a|no default|Loading|Retry|Settings|Today|Inbox|Calendar|Widget|Pending|Remote|Local|Already|Error:" apps packages -g '*.ts' -g '*.vue' -g '*.md' -g '*.rs'`

预期：只剩工程标识符、技术名、命令、URL、字段、枚举值或测试夹具数据。

### 任务 6：全量验证

**文件：**
- 除非验证发现遗漏文案，否则不直接编辑文件。

- [ ] **Step 1: 运行桌面端测试**

运行：`npm --prefix apps/desktop run test`

预期：PASS。

- [ ] **Step 2: 运行根验证**

运行：`npm run verify`

预期：PASS。

- [ ] **Step 3: 检查工作区改动**

运行：`git status --short`

预期：只出现本次中文化相关改动，以及进入本轮之前已经存在的测试文件改动。
