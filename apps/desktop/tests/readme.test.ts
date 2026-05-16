import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop README", () => {
  it("documents local sync queue and verification entrypoints", () => {
    const readmePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../README.md",
    );
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("Pending sync");
    expect(readme).toContain("sync_state");
    expect(readme).toContain("getSyncState");
    expect(readme).toContain("saveSyncState");
    expect(readme).toContain("buildDeltaPushFromPendingChanges");
    expect(readme).toContain("applyDeltaPushResponse");
    expect(readme).toContain("applyDeltaPullResponse");
    expect(readme).toContain("applyRemoteTask");
    expect(readme).toContain("deleteRemoteTask");
    expect(readme).toContain("without writing `local_changes`");
    expect(readme).toContain("runLocalSyncSimulation");
    expect(readme).toContain("createLocalSyncRunner");
    expect(readme).toContain("default Settings route");
    expect(readme).toContain("in-memory transport");
    expect(readme).toContain("createSyncRunner");
    expect(readme).toContain("createHttpLikeSyncTransport");
    expect(readme).toContain("HTTP-like sync transport");
    expect(readme).toContain("runOnce");
    expect(readme).toContain("runs delta pull after delta push");
    expect(readme).toContain("sinceCursor");
    expect(readme).toContain("transport");
    expect(readme).toContain("clears last error");
    expect(readme).toContain("records last error");
    expect(readme).toContain("pendingConflictCount");
    expect(readme).toContain("SYNC_RUN_STATUSES");
    expect(readme).toContain("summarizeDeltaPushResponse");
    expect(readme).toContain("Already synced");
    expect(readme).toContain("summarizePendingConflicts");
    expect(readme).toContain("Sync conflicts");
    expect(readme).toContain("Sync status");
    expect(readme).toContain("Pull applied");
    expect(readme).toContain("Sync state");
    expect(readme).toContain("onRunLocalSyncSimulation");
    expect(readme).toContain("Local sync simulation");
    expect(readme).toContain("keyboard-accessible");
    expect(readme).toContain("sync runner boundary");
    expect(readme).toContain("cursor state boundary");
    expect(readme).toContain("local simulation entrypoint");
    expect(readme).toContain("Manual acceptance");
    expect(readme).toContain("http://localhost:1420/settings");
    expect(readme).toContain("click `Local sync simulation`");
    expect(readme).toContain("confirm `Sync status`");
    expect(readme).toContain("confirm `Pull applied`");
    expect(readme).toContain("confirm `Sync state`");
    expect(readme).toContain("refreshes `Sync state`");
    expect(readme).toContain("Vite smoke only verifies the route, button, and error handling");
    expect(readme).toContain("Full SQLite success flow requires `npm run tauri dev`");
    expect(readme).toContain("no real network");
    expect(readme).toContain("Next sync boundary");
    expect(readme).toContain("delta pull application boundary");
    expect(readme).toContain("apply pulled tasks into local SQLite");
    expect(readme).toContain("real HTTP transport remains later");
    expect(readme).toContain("npm run verify");
  });
});
