import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API README 文档", () => {
  it("记录人工冲突解决的待处理响应", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("pending_manual");
    expect(readme).toContain("202");
    expect(readme).toContain("manual");
    expect(readme).toContain("等待人工处理");
  });

  it("记录待处理冲突列表路由", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("GET");
    expect(readme).toContain("/sync/conflicts");
    expect(readme).toContain("sync.listConflicts");
  });

  it("概述当前同步可见性范围和后端限制", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("同步可见性范围");
    expect(readme).toContain("baseVersion");
    expect(readme).toContain("server_wins");
    expect(readme).toContain("client_wins");
    expect(readme).toContain("真实 HTTP 服务");
  });

  it("记录实时同步事件仍只是契约与内存语义", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("/sync/events");
    expect(readme).toContain("sync.listEvents");
    expect(readme).toContain("实时事件范围");
    expect(readme).toContain("契约与内存语义");
    expect(readme).toContain("不启动 WebSocket 服务");
  });

  it("记录同步生成事件不包含生产推送基础设施", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("同步生成的实时事件");
    expect(readme).toContain("已接受的任务变更发布 `task.changed`");
    expect(readme).toContain("冲突发布 `conflict.raised`");
    expect(readme).toContain("被拒绝的变更不会发布 `task.changed`");
  });

  it("链接实时事件本地边界验收清单", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("BE-04 本地边界验收清单");
    expect(readme).toContain("docs/realtime-events-acceptance.md");
    expect(readme).toContain("不做通知投递");
  });

  it("记录通知骨架是没有投递渠道的本地队列", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("/notifications");
    expect(readme).toContain("notifications.list");
    expect(readme).toContain("/notifications/:id/ack");
    expect(readme).toContain("notifications.acknowledge");
    expect(readme).toContain("通知范围");
    expect(readme).toContain("createNotificationApi()");
    expect(readme).toContain("createInMemoryNotificationStore()");
    expect(readme).toContain("本地通知队列语义");
    expect(readme).toContain("不做 push delivery");
    expect(readme).toContain("不做 email delivery");
    expect(readme).toContain("不做 in-app delivery channel");
    expect(readme).toContain("不启动 background worker");
  });

  it("记录通知事件投影只是队列来源边界", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("通知事件投影边界");
    expect(readme).toContain("projectSyncEventToNotification()");
    expect(readme).toContain("enqueueNotificationsFromSyncEvents()");
    expect(readme).toContain("conflict.raised");
    expect(readme).toContain("sync.run.updated");
    expect(readme).toContain("队列来源边界");
    expect(readme).toContain("不是订阅");
    expect(readme).toContain("不是通知投递");
  });

  it("链接通知本地边界验收清单", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("BE-11 本地边界验收清单");
    expect(readme).toContain("docs/notification-acceptance.md");
    expect(readme).toContain("默认设置页展示通知");
  });
});
