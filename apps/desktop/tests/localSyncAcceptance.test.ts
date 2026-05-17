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

describe("本地同步验收清单", () => {
  it("被 README 手动验收章节链接", () => {
    const readme = readFileSync(readmePath, "utf-8");

    expect(readme).toContain("docs/local-sync-acceptance.md");
    expect(readme).toContain("本地同步验收清单");
  });

  it("记录不使用真实网络的设置页本地同步验收", () => {
    expect(existsSync(checklistPath)).toBe(true);

    const checklist = readFileSync(checklistPath, "utf-8");

    expect(checklist).toContain("# 本地同步验收清单");
    expect(checklist).toContain("范围");
    expect(checklist).toContain("Vite 冒烟");
    expect(checklist).toContain("Tauri WebView 完整 SQLite 流程");
    expect(checklist).toContain("远程配置展示冒烟");
    expect(checklist).toContain("回归护栏");
    expect(checklist).toContain("http://localhost:1420/settings");
    expect(checklist).toContain("npm run tauri dev");
    expect(checklist).toContain("本地同步模拟");
    expect(checklist).toContain("同步状态");
    expect(checklist).toContain("待同步变更");
    expect(checklist).toContain("同步历史");
    expect(checklist).toContain("同步拒绝");
    expect(checklist).toContain("同步冲突");
    expect(checklist).toContain("已应用拉取结果");
    expect(checklist).toContain("远程同步配置");
    expect(checklist).toContain("同步动作");
    expect(checklist).toContain("本地模拟");
    expect(checklist).toContain("VITE_MOMO_SYNC_BASE_URL=https://api.example.test/momo");
    expect(checklist).toContain("VITE_MOMO_SYNC_TOKEN=local-dev-token");
    expect(checklist).toContain("不会尝试真实网络请求");
    expect(checklist).toContain("不会调用 `createRemoteSyncRunner()`");
    expect(checklist).toContain("不要启动后台同步");
  });
});
