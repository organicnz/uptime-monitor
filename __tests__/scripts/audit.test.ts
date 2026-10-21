import { existsSync, readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import { IGNORED } from "../../scripts/audit";

/**
 * The audit gate fails the build on any advisory that is not suppressed.
 * A suppression is a hole in that gate, so the hole has to say why: a
 * suppression without a reason is one nobody can argue with when the
 * reason stops being true.
 */

const ROOT = join(import.meta.dir, "..", "..");

describe("dependency audit gate", () => {
  it("gives every suppression a reason", () => {
    for (const [id, reason] of Object.entries(IGNORED)) {
      expect(`${id}: ${reason.trim().length}`).not.toEndWith(": 0");
      expect(reason.trim().length).toBeGreaterThan(40);
    }
  });

  it("suppresses advisories by GHSA identifier", () => {
    // `bun audit --ignore` takes the GHSA identifier, which is the last
    // path segment of the advisory URL. A numeric id would silently match
    // nothing.
    for (const id of Object.keys(IGNORED)) {
      expect(id).toMatch(/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
    }
  });

  it("reads the machine-readable report rather than the prose", () => {
    const source = readFileSync(join(ROOT, "scripts", "audit.ts"), "utf-8");

    expect(source).toContain("bun audit --json");
    expect(source).toContain("JSON.parse");
    // The old gate tested the human-readable output for a sentence. A
    // sentence is not a data format: it changes when the tool's phrasing
    // changes, and the gate changes with it.
    expect(source).not.toMatch(/includes\(\s*"No vulnerabilities/);
  });

  it("is what CI runs", () => {
    const workflow = readFileSync(
      join(ROOT, ".github", "workflows", "audit.yml"),
      "utf-8",
    );

    expect(workflow).toContain("bun run audit");
    // The prose grep is gone: the gate fails the job itself.
    expect(workflow).not.toContain('grep -q "No vulnerabilities found"');
  });

  it("keeps the raw report available", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.audit).toBe("bun scripts/audit.ts");
    expect(pkg.scripts?.["audit:report"]).toBe("bun audit");
    expect(existsSync(join(ROOT, "scripts", "audit.ts"))).toBe(true);
  });
});
