import { existsSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import { findBinary, TSDK_DIR } from "@/scripts/tsrs-tsdk";

const ROOT = join(import.meta.dir, "..", "..");

describe("the language server directory", () => {
  it("finds the native binary, whichever platform package it is in", () => {
    // The package is `@tsrs/<os>-<arch>`, so the platform is not
    // something this has to know.
    const binary = findBinary(ROOT);

    expect(binary).toBeDefined();
    expect(existsSync(binary as string)).toBe(true);
  });

  it("is the directory the editor is pointed at", async () => {
    const pkg = JSON.parse(
      await Bun.file(join(ROOT, "package.json")).text(),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.["tsrs:tsdk"]).toBe("bun scripts/tsrs-tsdk.ts");
    expect(TSDK_DIR).toBe(".tsrs-tsdk");
  });
});
