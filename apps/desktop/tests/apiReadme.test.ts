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
});
