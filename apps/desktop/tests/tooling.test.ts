import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("测试工具链", () => {
  it("运行在 Vitest 下", () => {
    expect(true).toBe(true);
  });

  it("记录中文文本开发规范", () => {
    const workspaceRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    const standard = readFileSync(resolve(workspaceRoot, "AGENTS.md"), "utf-8");

    expect(standard).toContain("中文文本开发规范");
    expect(standard).toContain(
      "页面文本、注释、测试描述、测试断言和文档默认使用中文",
    );
    expect(standard).toContain(
      "工程标识符、外部协议字段、路由、命令和环境变量保持英文",
    );
  });

  it("保持桌面端 UI 技术栈使用 Vue 而非 React", () => {
    const packagePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../package.json",
    );
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    expect(dependencies.vue).toBeDefined();
    expect(dependencies["vue-router"]).toBeDefined();
    expect(dependencies["@vitejs/plugin-vue"]).toBeDefined();
    expect(dependencies.react).toBeUndefined();
    expect(dependencies["react-dom"]).toBeUndefined();
    expect(dependencies["react-router-dom"]).toBeUndefined();
    expect(dependencies["@vitejs/plugin-react"]).toBeUndefined();
  });

  it("确保桌面端源码不包含 React TSX 入口", () => {
    const desktopRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const sourceFiles = listFiles(resolve(desktopRoot, "src"));
    const testFiles = listFiles(resolve(desktopRoot, "tests"));
    const reactSourcePattern =
      /from\s+["'](?:react|react-dom|react-router-dom|lucide-react)["']|React\./;

    expect(
      [...sourceFiles, ...testFiles]
        .filter((file) => /\.(tsx|jsx)$/.test(file))
        .map((file) => file.replace(`${desktopRoot}\\`, "")),
    ).toEqual([]);
    expect(
      sourceFiles
        .filter((file) => /\.(ts|vue)$/.test(file))
        .filter((file) => reactSourcePattern.test(readFileSync(file, "utf-8")))
        .map((file) => file.replace(`${desktopRoot}\\`, "")),
    ).toEqual([]);
  });

  it("确保默认设置页路由不接入远程 runner 工厂", () => {
    const desktopRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const appSource = readFileSync(resolve(desktopRoot, "src/App.vue"), "utf-8");
    const defaultRuntimeSource = readFileSync(
      resolve(desktopRoot, "src/sync/defaultSettingsSyncRuntime.ts"),
      "utf-8",
    );

    expect(appSource).toContain("createDefaultSettingsSyncRuntime");
    expect(appSource).not.toContain("createRemoteSyncRunner");
    expect(defaultRuntimeSource).toContain("createLocalSyncRunner");
    expect(defaultRuntimeSource).not.toContain("createRemoteSyncRunner");
  });
});

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
