import { describe, expect, it } from "bun:test";

import { collectChecks, report, runDoctor } from "../../scripts/doctor";

/**
 * The doctor is the executable form of the "no Node.js" rule: it checks
 * that the repository is configured to run entirely on Bun. These tests
 * assert the invariants it guards, so a regression in `bunfig.toml` or
 * `package.json` fails the suite rather than waiting for a developer to
 * notice.
 */

describe("environment doctor", () => {
  it("passes every structural check on a correctly configured repository", async () => {
    const checks = await collectChecks();
    const failures = checks.filter((check) => !check.ok && !check.warning);

    expect(failures.map((check) => `${check.name}: ${check.detail}`)).toEqual(
      [],
    );
  });

  it("checks the things that would let Node.js back in", async () => {
    const checks = await collectChecks();
    const names = checks.map((check) => check.name);

    expect(names).toContain("runtime");
    expect(names).toContain("node alias");
    expect(names).toContain("node binary");
    expect(names).toContain("lockfile");
    expect(names).toContain("dependencies");
    expect(names).toContain("formatter");
    expect(names).toContain("linter");
    expect(names).toContain("environment");
  });

  it("audits the Bun policy in bunfig.toml", async () => {
    const checks = await collectChecks();
    const names = checks.map((check) => check.name);

    // The settings the "no Node.js" rule depends on, each read out of the
    // parsed file rather than out of a regular expression.
    expect(names).toContain("bunfig");
    expect(names).toContain("shell");
    expect(names).toContain("orphans");
    expect(names).toContain("test order");
    expect(names).toContain("lint warnings");
    expect(names).toContain("type-aware lint");
    expect(names).toContain("supply chain");
    expect(names).toContain("trusted dependencies");

    for (const name of [
      "bunfig",
      "shell",
      "orphans",
      "test order",
      "lint warnings",
      "type-aware lint",
      "supply chain",
      "trusted dependencies",
    ]) {
      const check = checks.find((c) => c.name === name);
      expect(`${name}: ${check?.detail}`).not.toContain("does not");
    }
  });

  it("confirms the coverage gate reads Bun's own report", async () => {
    const checks = await collectChecks();
    const coverage = checks.find((check) => check.name === "coverage gate");

    expect(coverage?.ok).toBe(true);
    expect(coverage?.detail).toContain("lcov");
  });

  it("confirms the node-to-bun alias is configured", async () => {
    const checks = await collectChecks();
    const alias = checks.find((check) => check.name === "node alias");

    expect(alias?.ok).toBe(true);
    expect(alias?.detail).toContain("[run] bun = true");
  });

  it("confirms the lockfile matches package.json", async () => {
    const checks = await collectChecks();
    const lockfile = checks.find((check) => check.name === "lockfile");

    expect(lockfile?.ok).toBe(true);
  });

  it("confirms no Node.js-only tooling is installed", async () => {
    const checks = await collectChecks();
    const dependencies = checks.find((check) => check.name === "dependencies");

    expect(dependencies?.ok).toBe(true);
    expect(dependencies?.detail).not.toContain("prettier");
    expect(dependencies?.detail).not.toContain("eslint");
  });

  it("confirms the formatter and the linter are Bun's own", async () => {
    const checks = await collectChecks();

    const formatter = checks.find((check) => check.name === "formatter");
    expect(formatter?.ok).toBe(true);
    expect(formatter?.detail).toContain("bun fmt");

    const linter = checks.find((check) => check.name === "linter");
    expect(linter?.ok).toBe(true);
    expect(linter?.detail).toContain("bun lint");
  });

  it("fails on a structural failure and only warns otherwise", () => {
    const failed = report(
      [
        {
          name: "broken",
          ok: false,
          detail: "something is wrong",
        },
      ],
      false,
    );
    expect(failed).toBe(1);

    const warned = report(
      [
        {
          name: "warned",
          ok: false,
          detail: "something is worth noting",
          warning: true,
        },
      ],
      false,
    );
    expect(warned).toBe(0);

    const warnedStrict = report(
      [
        {
          name: "warned",
          ok: false,
          detail: "something is worth noting",
          warning: true,
        },
      ],
      true,
    );
    expect(warnedStrict).toBe(1);
  });

  it("exits 0 when the environment is healthy", async () => {
    expect(await runDoctor()).toBe(0);
  });
});
