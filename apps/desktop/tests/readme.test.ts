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
    expect(readme).toContain("runLocalSyncSimulation");
    expect(readme).toContain("createSyncRunner");
    expect(readme).toContain("runOnce");
    expect(readme).toContain("transport");
    expect(readme).toContain("pendingConflictCount");
    expect(readme).toContain("SYNC_RUN_STATUSES");
    expect(readme).toContain("summarizeDeltaPushResponse");
    expect(readme).toContain("Already synced");
    expect(readme).toContain("summarizePendingConflicts");
    expect(readme).toContain("Sync conflicts");
    expect(readme).toContain("Sync status");
    expect(readme).toContain("Sync state");
    expect(readme).toContain("onRunLocalSyncSimulation");
    expect(readme).toContain("Local sync simulation");
    expect(readme).toContain("keyboard-accessible");
    expect(readme).toContain("sync runner boundary");
    expect(readme).toContain("cursor state boundary");
    expect(readme).toContain("local simulation entrypoint");
    expect(readme).toContain("npm run verify");
  });
});
