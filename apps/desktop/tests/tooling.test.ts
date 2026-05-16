import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

describe("test tooling", () => {
  it("runs under Vitest", () => {
    expect(true).toBe(true);
  });

  it("keeps the desktop UI stack on Vue instead of React", () => {
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

  it("keeps desktop source files free of React TSX entrypoints", () => {
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
});

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}
