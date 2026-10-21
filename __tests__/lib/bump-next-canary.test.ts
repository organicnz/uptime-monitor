import { describe, expect, it } from "bun:test";

import {
  canaryExclusions,
  currentCanaryEntries,
  patchExcludes,
  patchPackageJson,
} from "@/scripts/bump-next-canary";

/**
 * Bumping the Next.js canary.
 *
 * The canary moves every few hours, and the supply-chain cooldown rejects
 * anything published in the last three days, so every bump has to move the
 * version in `package.json` and the exemption list in `bunfig.toml` together.
 * These are the rules that keep the two in step.
 */
describe("the canary exemptions", () => {
  const manifest = {
    name: "next",
    version: "16.5.0-canary.21",
    dependencies: {
      "@next/env": "16.5.0-canary.21",
      postcss: "8.5.23",
      "styled-jsx": "5.1.6",
    },
    optionalDependencies: {
      "@next/swc-darwin-arm64": "16.5.0-canary.21",
      "@next/swc-linux-x64-musl": "16.5.0-canary.21",
      sharp: "^0.35.4",
    },
  };

  it("exempts the canary and every package published with it", () => {
    expect(canaryExclusions(manifest, "16.5.0-canary.21")).toEqual([
      "@next/env@16.5.0-canary.21",
      "@next/swc-darwin-arm64@16.5.0-canary.21",
      "@next/swc-linux-x64-musl@16.5.0-canary.21",
      "next@16.5.0-canary.21",
    ]);
  });

  it("leaves a dependency on a version range alone", () => {
    // `sharp` and `postcss` are not published with the canary, so the
    // cooldown resolves them to something it already allows. Exempting them
    // would widen the exemption past what the canary needs.
    const entries = canaryExclusions(manifest, "16.5.0-canary.21");

    expect(entries.some((entry) => entry.includes("sharp"))).toBe(false);
    expect(entries.some((entry) => entry.includes("postcss"))).toBe(false);
  });
});

describe("patching bunfig.toml", () => {
  const bunfig = [
    "[install]",
    "minimumReleaseAgeExcludes = [",
    '  "tsrs",',
    '  "typescript",',
    "  # The Next.js canary, and the platform packages that publish with it.",
    '  "next@16.5.0-canary.20",',
    '  "@next/env@16.5.0-canary.20",',
    '  "bun-types@1.4.4-canary.20261019T141446",',
    "]",
    "",
  ].join("\n");

  it("replaces the canary exemptions and keeps everything else", () => {
    const patched = patchExcludes(bunfig, [
      "next@16.5.0-canary.21",
      "@next/env@16.5.0-canary.21",
    ]);

    expect(patched).toContain('"next@16.5.0-canary.21",');
    expect(patched).toContain('"@next/env@16.5.0-canary.21",');
    // The other exemptions, and the comment that explains them, survive.
    expect(patched).toContain('"tsrs",');
    expect(patched).toContain('"typescript",');
    expect(patched).toContain('"bun-types@1.4.4-canary.20261019T141446",');
    expect(patched).toContain(
      "# The Next.js canary, and the platform packages that publish with it.",
    );
    // The old build is gone.
    expect(patched).not.toContain("16.5.0-canary.20");
  });

  it("reads the current exemptions back", () => {
    expect(currentCanaryEntries(bunfig)).toEqual([
      "next@16.5.0-canary.20",
      "@next/env@16.5.0-canary.20",
    ]);
  });

  it("fails loudly when there is nothing to replace", () => {
    const without = bunfig
      .split("\n")
      .filter((line) => !/^\s*"(next|@next\/)/.test(line))
      .join("\n");

    expect(() => patchExcludes(without, ["next@16.5.0-canary.21"])).toThrow(
      /no Next\.js canary exemptions/,
    );
  });
});

describe("patching package.json", () => {
  it("points the next dependency at the new version", () => {
    const source =
      '{\n  "dependencies": {\n    "next": "16.5.0-canary.20"\n  }\n}\n';

    expect(patchPackageJson(source, "16.5.0-canary.21")).toContain(
      '"next": "16.5.0-canary.21"',
    );
  });

  it("fails loudly when there is no next dependency", () => {
    expect(() => patchPackageJson('{"dependencies": {}}\n', "1.0.0")).toThrow(
      /no `next` dependency/,
    );
  });
});
