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
    expect(readme).toContain("summarizeDeltaPushResponse");
    expect(readme).toContain("summarizePendingConflicts");
    expect(readme).toContain("Sync conflicts");
    expect(readme).toContain("npm run verify");
  });
});
