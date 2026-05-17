import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("工作区验证脚本", () => {
  it("提供运行所有本地检查的根 verify 命令", () => {
    const packageJsonPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../package.json",
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    expect(packageJson.scripts).toMatchObject({
      "verify:desktop:test": "npm --prefix apps/desktop run test",
      "verify:desktop:build": "npm --prefix apps/desktop run build",
      "verify:tauri": "cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml",
      "verify:contracts": "node apps/desktop/node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json",
      "verify:api": "node apps/desktop/node_modules/typescript/bin/tsc -p apps/api/tsconfig.json",
      verify:
        "npm run verify:desktop:test && npm run verify:desktop:build && npm run verify:tauri && npm run verify:contracts && npm run verify:api",
    });
  });
});
