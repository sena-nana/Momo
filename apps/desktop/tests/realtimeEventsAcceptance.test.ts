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

describe("realtime events acceptance checklist", () => {
  it("documents the BE-04 local-only realtime event boundary", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf-8");

    expect(checklist).toContain("# Realtime events acceptance checklist");
    expect(checklist).toContain("BE-04 local-only boundary");
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
    expect(checklist).toContain("sequence catch-up");
    expect(checklist).toContain("no WebSocket server");
    expect(checklist).toContain("no Redis/event bus");
    expect(checklist).toContain("no production backend");
    expect(checklist).toContain("no notification delivery");
    expect(checklist).toContain("default Settings route stays on local simulation");
  });

  it("links the checklist from API and desktop readmes", () => {
    const apiReadme = readFileSync(apiReadmePath, "utf-8");
    const desktopReadme = readFileSync(desktopReadmePath, "utf-8");

    expect(apiReadme).toContain("docs/realtime-events-acceptance.md");
    expect(desktopReadme).toContain("docs/realtime-events-acceptance.md");
  });
});
