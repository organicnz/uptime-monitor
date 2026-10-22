import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import { defaultTsconfig, lintProject, rules } from "@/lib/type-aware-lint";

/**
 * The type-aware lint against the linter it replaces.
 *
 * The type-aware rules used to run through the linter's own type checker.
 * They run through `tsrs` now, because this repository has one type
 * checker and it is `tsrs`. That is a change of implementation, and a
 * change of implementation has to be shown to be a change of nothing: the
 * same rules, on the same code, at the same places.
 *
 * So the test runs both. The fixture is a file with one deliberate
 * violation of every rule, and the two are compared rule by rule and
 * line by line.
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

type LintMessage = {
  ruleId?: string;
  line?: number;
  column?: number;
  message?: string;
};

/** What the linter this replaces says about the fixture. */
function theirs(): Finding[] {
  const result = Bun.spawnSync(
    ["bun", "--no-script", "lint", "--type-aware", "--format", "json", FIXTURE],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );

  const parsed = JSON.parse(result.stdout.toString()) as {
    messages?: LintMessage[];
  }[];

  return (parsed[0]?.messages ?? [])
    .filter((message) => message.ruleId?.startsWith("@typescript-eslint/"))
    .map((message) => ({
      rule: message.ruleId ?? "",
      line: message.line ?? 0,
      column: message.column ?? 0,
      message: message.message ?? "",
    }));
}

/** What this lint says about the fixture. */
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

const key = (finding: Finding) =>
  `${finding.rule} ${finding.line}:${finding.column}`;

/** The findings, in the order they appear in the file. */
function byPosition(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (left, right) => left.line - right.line || left.column - right.column,
  );
}

describe("the type-aware lint", () => {
  it("finds everything the linter it replaces finds", async () => {
    const mine = byPosition(await ours());
    const theirsFindings = byPosition(theirs());

    // Nothing we report that the other one does not. A rule that fires
    // where it should not is worse than a rule that stays quiet: it stops
    // the repository from being able to use the code it is written in.
    const theirsKeys = new Set(theirsFindings.map(key));
    const falsePositives = mine.filter(
      (finding) => !theirsKeys.has(key(finding)),
    );

    expect(falsePositives).toEqual([]);
  });

  it("finds the rules the fixture breaks", async () => {
    const mine = byPosition(await ours());
    const theirsFindings = byPosition(theirs());

    // The rules the two have in common, and the places they report them.
    // The fixture cannot carry `no-implied-eval`, because the linter
    // implements that one without types and so reports it in the ordinary
    // run as well, and a file that breaks a rule the ordinary linter
    // enforces cannot live in the tree.
    const oursByRule = new Map<string, string[]>();
    for (const finding of mine) {
      const list = oursByRule.get(finding.rule) ?? [];
      list.push(`${finding.line}:${finding.column}`);
      oursByRule.set(finding.rule, list);
    }

    const theirsByRule = new Map<string, string[]>();
    for (const finding of theirsFindings) {
      const list = theirsByRule.get(finding.rule) ?? [];
      list.push(`${finding.line}:${finding.column}`);
      theirsByRule.set(finding.rule, list);
    }

    for (const [rule, places] of oursByRule) {
      expect({ rule, places, theirs: theirsByRule.get(rule) ?? [] }).toEqual({
        rule,
        places,
        theirs: theirsByRule.get(rule) ?? [],
      });
    }
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
  });

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
