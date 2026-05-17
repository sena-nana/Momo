import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API README", () => {
  it("documents manual conflict resolution as a pending HTTP-like response", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("pending_manual");
    expect(readme).toContain("202");
    expect(readme).toContain("manual");
  });

  it("documents the pending conflict list route", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("GET");
    expect(readme).toContain("/sync/conflicts");
    expect(readme).toContain("sync.listConflicts");
  });

  it("summarizes the current sync visibility scope and backend limits", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("Sync visibility scope");
    expect(readme).toContain("baseVersion");
    expect(readme).toContain("server_wins");
    expect(readme).toContain("client_wins");
    expect(readme).toContain("真实 HTTP server");
  });

  it("documents realtime sync events as contract and in-memory semantics only", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("/sync/events");
    expect(readme).toContain("sync.listEvents");
    expect(readme).toContain("Realtime events scope");
    expect(readme).toContain("contract and in-memory semantics");
    expect(readme).toContain("no WebSocket server");
  });

  it("documents sync-generated realtime events without production push infrastructure", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("sync-generated realtime events");
    expect(readme).toContain("accepted task changes publish `task.changed`");
    expect(readme).toContain("conflicts publish `conflict.raised`");
    expect(readme).toContain("rejected changes do not publish `task.changed`");
  });

  it("links the realtime events local-only acceptance checklist", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("BE-04 local-only boundary");
    expect(readme).toContain("docs/realtime-events-acceptance.md");
    expect(readme).toContain("no notification delivery");
  });

  it("documents the notification skeleton as a local queue without delivery channels", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("/notifications");
    expect(readme).toContain("notifications.list");
    expect(readme).toContain("/notifications/:id/ack");
    expect(readme).toContain("notifications.acknowledge");
    expect(readme).toContain("Notification scope");
    expect(readme).toContain("createNotificationApi()");
    expect(readme).toContain("createInMemoryNotificationStore()");
    expect(readme).toContain("local notification queue semantics");
    expect(readme).toContain("no push delivery");
    expect(readme).toContain("no email delivery");
    expect(readme).toContain("no in-app delivery channel");
    expect(readme).toContain("no background worker");
  });
});
