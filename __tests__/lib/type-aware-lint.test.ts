import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import { defaultTsconfig, lintProject, rules } from "@/lib/type-aware-lint";

/**
 * The type-aware lint, against the findings it is supposed to make.
 *
 * The rules used to run through the linter's own type checker. They run
 * through `tsrs` now, because this repository has one type checker and it
 * is `tsrs`.
 *
 * The expectations are a file, and the file was written by running both
 * implementations against the fixture and keeping the findings they
 * agreed on. A rule that stops firing, fires somewhere else, or fires
 * twice is a change in the file, and the change is visible in the diff.
 *
 * The comparison is not made against the linter any more, and that is
 * the point: running it would put a second type checker in the chain to
 * check the first one's work. The expectations are the contract now.
 */

const ROOT = join(import.meta.dir, "..", "..");
const FIXTURE = join(ROOT, "fixtures", "type-aware-violations.ts");

// The fixture has its own configuration, because some of the rules it
// breaks can only be broken by code that does not type check, and the
// compiler is the gate.
const FIXTURE_TSCONFIG = join(ROOT, "fixtures", "tsconfig.json");

type Finding = {
  rule: string;
  line: number;
  column: number;
  message: string;
};

/** The findings the fixture is supposed to produce. */
async function expected(): Promise<Finding[]> {
  const file = join(ROOT, "fixtures", "type-aware-violations.expected.json");
  return (await Bun.file(file).json()) as Finding[];
}

/** The findings this lint produces. */
async function ours(): Promise<Finding[]> {
  const findings = await lintProject({
    cwd: ROOT,
    tsconfig: FIXTURE_TSCONFIG,
    files: [FIXTURE],
  });
  return findings.map((finding) => ({
    rule: finding.rule,
    line: finding.line,
    column: finding.column,
    message: finding.message,
  }));
}

/** The findings, in the order they appear in the file. */
function byPosition(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
}

describe("the type-aware lint", () => {
  it("finds what the fixture breaks", async () => {
    expect(byPosition(await ours())).toEqual(byPosition(await expected()));
  });

  it("finds nothing in the repository", async () => {
    // The whole project, the way the gate lints it: the files the
    // compiler has in its program, minus the ones that are not this
    // code. The repository is clean, so this is the finding that matters
    // most — a rule that fires on the repository's own code is a rule
    // that stops the repository from being written.
    const findings = await lintProject({
      cwd: ROOT,
      tsconfig: defaultTsconfig(ROOT),
    });

    expect(findings).toEqual([]);
  }, 60_000); // The whole project, through the checker: a few seconds.

  it("implements the rules the linter enables", () => {
    // The rules that need types, as the linter lists them. Each one is a
    // rule the two implementations have in common, and a rule that is
    // missing is a rule that is not being checked.
    const oursByName = new Set(rules.map((rule) => rule.name));

    for (const name of [
      "@typescript-eslint/await-thenable",
      "@typescript-eslint/no-array-delete",
      "@typescript-eslint/no-base-to-string",
      "@typescript-eslint/no-duplicate-type-constituents",
      "@typescript-eslint/no-floating-promises",
      "@typescript-eslint/no-for-in-array",
      "@typescript-eslint/no-implied-eval",
      "@typescript-eslint/no-misused-promises",
      "@typescript-eslint/no-redundant-type-constituents",
      "@typescript-eslint/no-unnecessary-type-assertion",
      "@typescript-eslint/no-unsafe-argument",
      "@typescript-eslint/no-unsafe-assignment",
      "@typescript-eslint/no-unsafe-call",
      "@typescript-eslint/no-unsafe-enum-comparison",
      "@typescript-eslint/no-unsafe-member-access",
      "@typescript-eslint/no-unsafe-return",
      "@typescript-eslint/no-unsafe-unary-minus",
      "@typescript-eslint/only-throw-error",
      "@typescript-eslint/prefer-promise-reject-errors",
      "@typescript-eslint/require-await",
      "@typescript-eslint/restrict-plus-operands",
      "@typescript-eslint/restrict-template-expressions",
      "@typescript-eslint/unbound-method",
    ]) {
      expect(oursByName.has(name)).toBe(true);
    }
  });
});
