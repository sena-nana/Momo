import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workspace verification scripts", () => {
  it("exposes a root verify command that runs all local checks", () => {
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
