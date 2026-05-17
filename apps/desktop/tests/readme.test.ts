import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("桌面端 README 文档", () => {
  it("记录本地同步队列与验证入口", () => {
    const readmePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../README.md",
    );
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("Tauri 2 + Vue 3 + TypeScript");
    expect(readme).toContain("本地数据");
    expect(readme).toContain("共享契约");
    expect(readme).toContain("本地同步前置层");
    expect(readme).toContain("手动验收");
    expect(readme).toContain("BE-03 本地同步边界");
    expect(readme).toContain("当前限制");
    expect(readme).toContain("sync_state");
    expect(readme).toContain("sync_runs");
    expect(readme).toContain("task_sync_versions");
    expect(readme).toContain("TaskRepository.getSyncState()");
    expect(readme).toContain("TaskRepository.recordSyncRun()");
    expect(readme).toContain("baseVersion");
    expect(readme).toContain("buildDeltaPushFromPendingChanges()");
    expect(readme).toContain("applyDeltaPushResponse()");
    expect(readme).toContain("applyDeltaPullResponse()");
    expect(readme).toContain("runLocalSyncSimulation()");
    expect(readme).toContain("createLocalSyncRunner()");
    expect(readme).toContain("createSyncRunner()");
    expect(readme).toContain("createHttpLikeSyncTransport()");
    expect(readme).toContain("createHttpSyncTransport()");
    expect(readme).toContain("createRemoteSyncConfig()");
    expect(readme).toContain("createRemoteSyncRunner()");
    expect(readme).toContain("createDefaultSettingsSyncRuntime()");
    expect(readme).toContain("VITE_MOMO_SYNC_BASE_URL");
    expect(readme).toContain("VITE_MOMO_SYNC_TOKEN");
    expect(readme).toContain("未配置 HTTP 同步 baseUrl");
    expect(readme).toContain("已完成同步");
    expect(readme).toContain("待同步变更");
    expect(readme).toContain("同步历史");
    expect(readme).toContain("同步冲突");
    expect(readme).toContain("同步拒绝");
    expect(readme).toContain("已应用拉取结果");
    expect(readme).toContain("远程同步配置");
    expect(readme).toContain("本地同步模拟");
    expect(readme).toContain("http://localhost:1420/settings");
    expect(readme).toContain("docs/local-sync-acceptance.md");
    expect(readme).toContain("docs/realtime-events-acceptance.md");
    expect(readme).toContain("docs/notification-acceptance.md");
    expect(readme).toContain("npm run verify");
  });

  it("记录实时事件与通知边界仍停留在本地模拟", () => {
    const readmePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../README.md",
    );
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("BE-04 本地边界验收清单");
    expect(readme).toContain("GET /sync/events");
    expect(readme).toContain("不会启动 WebSocket server");
    expect(readme).toContain("不接 Redis/event bus");
    expect(readme).toContain("不接生产后端");
    expect(readme).toContain("不做通知投递");
    expect(readme).toContain("BE-11 Notification 骨架");
    expect(readme).toContain("NotificationDto");
    expect(readme).toContain("createNotificationApi()");
    expect(readme).toContain("createInMemoryNotificationStore()");
    expect(readme).toContain("不做 push delivery");
    expect(readme).toContain("不做 email delivery");
    expect(readme).toContain("不做 in-app delivery channel");
    expect(readme).toContain("不启动 background worker");
    expect(readme).toContain("通知事件投影边界");
    expect(readme).toContain("projectSyncEventToNotification()");
    expect(readme).toContain("enqueueNotificationsFromSyncEvents()");
    expect(readme).toContain("队列来源边界");
    expect(readme).toContain("默认设置页路由保持在本地模拟");
    expect(readme).not.toContain("下一步建议围绕 HTTP transport 增加认证 header / base URL 配置边界");
  });
});
