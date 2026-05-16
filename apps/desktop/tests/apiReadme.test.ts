import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API README", () => {
  it("documents manual conflict resolution as a pending HTTP-like response", () => {
    const readme = readFileSync(
      resolve(process.cwd(), "../../apps/api/README.md"),
      "utf-8",
    );

    expect(readme).toContain("pending_manual");
    expect(readme).toContain("202");
    expect(readme).toContain("manual");
  });
});
