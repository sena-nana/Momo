import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = resolve(desktopRoot, "docs/notification-acceptance.md");
const apiReadmePath = resolve(desktopRoot, "../../apps/api/README.md");
const desktopReadmePath = resolve(desktopRoot, "README.md");

describe("通知验收清单", () => {
  it("记录 BE-11 本地通知边界", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf-8");

    expect(checklist).toContain("# 通知验收清单");
    expect(checklist).toContain("BE-11 本地边界");
    expect(checklist).toContain("NotificationDto");
    expect(checklist).toContain("createNotificationApi()");
    expect(checklist).toContain("createInMemoryNotificationStore()");
    expect(checklist).toContain("GET /notifications");
    expect(checklist).toContain("POST /notifications/:id/ack");
    expect(checklist).toContain("projectSyncEventToNotification()");
    expect(checklist).toContain("enqueueNotificationsFromSyncEvents()");
    expect(checklist).toContain("本地通知队列语义");
    expect(checklist).toContain("conflict.raised");
    expect(checklist).toContain("sync.run.updated");
    expect(checklist).toContain("不做 push delivery");
    expect(checklist).toContain("不做 email delivery");
    expect(checklist).toContain("不做 in-app delivery channel");
    expect(checklist).toContain("不启动 background worker");
    expect(checklist).toContain("不实现用户通知偏好系统");
    expect(checklist).toContain("不接生产后端");
    expect(checklist).toContain("默认设置页不展示通知");
    expect(checklist).toContain("默认设置页路由保持在本地模拟");
  });

  it("从 API 和桌面端 README 链接清单", () => {
    const apiReadme = readFileSync(apiReadmePath, "utf-8");
    const desktopReadme = readFileSync(desktopReadmePath, "utf-8");

    expect(apiReadme).toContain("docs/notification-acceptance.md");
    expect(desktopReadme).toContain("docs/notification-acceptance.md");
  });
});
