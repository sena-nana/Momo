import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = resolve(
  desktopRoot,
  "docs/realtime-events-acceptance.md",
);
const apiReadmePath = resolve(desktopRoot, "../../apps/api/README.md");
const desktopReadmePath = resolve(desktopRoot, "README.md");

describe("实时事件验收清单", () => {
  it("记录 BE-04 本地实时事件边界", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf-8");

    expect(checklist).toContain("# 实时事件验收清单");
    expect(checklist).toContain("BE-04 本地边界");
    expect(checklist).toContain("SyncEventDto");
    expect(checklist).toContain("createSyncEventApi()");
    expect(checklist).toContain("createInMemorySyncEventStore()");
    expect(checklist).toContain("GET /sync/events");
    expect(checklist).toContain("createHttpLikeSyncTransport()");
    expect(checklist).toContain("createHttpSyncTransport()");
    expect(checklist).toContain("summarizeSyncEvents()");
    expect(checklist).toContain("fetchRealtimeEventCatchUp()");
    expect(checklist).toContain("task.changed");
    expect(checklist).toContain("conflict.raised");
    expect(checklist).toContain("sync.run.updated");
    expect(checklist).toContain("sequence 补拉");
    expect(checklist).toContain("不启动 WebSocket server");
    expect(checklist).toContain("不接 Redis/event bus");
    expect(checklist).toContain("不接生产后端");
    expect(checklist).toContain("不做通知投递");
    expect(checklist).toContain("默认设置页路由保持在本地模拟");
  });

  it("从 API 和桌面端 README 链接清单", () => {
    const apiReadme = readFileSync(apiReadmePath, "utf-8");
    const desktopReadme = readFileSync(desktopReadmePath, "utf-8");

    expect(apiReadme).toContain("docs/realtime-events-acceptance.md");
    expect(desktopReadme).toContain("docs/realtime-events-acceptance.md");
  });
});
