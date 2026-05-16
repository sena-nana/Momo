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
    expect(readme).toContain("buildDeltaPushFromPendingChanges");
    expect(readme).toContain("applyDeltaPushResponse");
    expect(readme).toContain("runLocalSyncSimulation");
    expect(readme).toContain("pendingConflictCount");
    expect(readme).toContain("SYNC_RUN_STATUSES");
    expect(readme).toContain("summarizeDeltaPushResponse");
    expect(readme).toContain("Already synced");
    expect(readme).toContain("summarizePendingConflicts");
    expect(readme).toContain("Sync conflicts");
    expect(readme).toContain("Sync status");
    expect(readme).toContain("sync runner boundary");
    expect(readme).toContain("local simulation entrypoint");
    expect(readme).toContain("npm run verify");
  });
});
