import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = resolve(
  desktopRoot,
  "docs/local-sync-acceptance.md",
);
const readmePath = resolve(desktopRoot, "README.md");

describe("local sync acceptance checklist", () => {
  it("is linked from the README manual acceptance section", () => {
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("docs/local-sync-acceptance.md");
    expect(readme).toContain("Local sync acceptance checklist");
  });

  it("documents local-only Settings sync acceptance without real network", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf-8");

    expect(checklist).toContain("# Local sync acceptance checklist");
    expect(checklist).toContain("Scope");
    expect(checklist).toContain("Vite smoke");
    expect(checklist).toContain("Tauri WebView full SQLite flow");
    expect(checklist).toContain("Remote config display smoke");
    expect(checklist).toContain("Regression guardrails");
    expect(checklist).toContain("http://localhost:1420/settings");
    expect(checklist).toContain("npm run tauri dev");
    expect(checklist).toContain("Local sync simulation");
    expect(checklist).toContain("Sync status");
    expect(checklist).toContain("Sync state");
    expect(checklist).toContain("Pending changes");
    expect(checklist).toContain("Sync history");
    expect(checklist).toContain("Sync rejections");
    expect(checklist).toContain("Sync conflicts");
    expect(checklist).toContain("Pull applied");
    expect(checklist).toContain("Remote sync config");
    expect(checklist).toContain("Sync action");
    expect(checklist).toContain("Local simulation");
    expect(checklist).toContain("VITE_MOMO_SYNC_BASE_URL=https://api.example.test/momo");
    expect(checklist).toContain("VITE_MOMO_SYNC_TOKEN=local-dev-token");
    expect(checklist).toContain("no real network");
    expect(checklist).toContain("does not call `createRemoteSyncRunner()`");
    expect(checklist).toContain("does not start background sync");
  });
});
