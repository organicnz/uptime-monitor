import { join, relative, sep } from "bun:path";

import type { Node, SourceFile } from "tsrs/unstable/ast";

import { isDisabled, readDisables } from "./disables";
import { disabledRules, enabledRules, readOverrides } from "./overrides";
import { assertionRules } from "./rules/assertions";
import { asyncRules } from "./rules/async";
import { enumRules } from "./rules/enums";
import { expressionRules } from "./rules/expressions";
import { promiseRules } from "./rules/promises";
import { typeRules } from "./rules/types";
import { unsafeRules } from "./rules/unsafe";
import { openSession, type Session } from "./session";
import type { FileNodes, Finding, Position, Rule } from "./types";

export type { Finding, Position, Rule };

/** Every rule, in the order the findings are reported. */
export const rules: Rule[] = [
  ...unsafeRules,
  ...promiseRules,
  ...assertionRules,
  ...asyncRules,
  ...expressionRules,
  ...enumRules,
  ...typeRules,
];

export type LintOptions = {
  /** The project root. */
  cwd: string;
  /** The tsconfig the project is described by. */
  tsconfig: string;
  /** The rules to run. */
  rules?: readonly Rule[];
  /** Only these files. */
  files?: readonly string[];
};

/**
 * The files of the project that are worth linting.
 *
 * The program holds the whole dependency graph — every package's type
 * declarations are in it — and the declarations are not this code.
 *
 * The `fixtures/` tree is excluded as well. The fixture there breaks the
 * type-aware rules on purpose, and the test that compares the two
 * implementations lints it directly.
 */
function isProjectFile(path: string, cwd: string): boolean {
  if (!path.startsWith(cwd + sep)) return false;
  const relativePath = relative(cwd, path);
  if (relativePath.startsWith("..")) return false;
  const segments = relativePath.split(sep);
  if (segments.includes("node_modules")) return false;
  if (segments.includes(".next")) return false;
  if (segments.includes("fixtures")) return false;
  if (relativePath.endsWith(".d.ts")) return false;
  return true;
}

/**
 * Walk a file once, and group its nodes by kind.
 *
 * The rules share the buckets. A walk is about four tenths of a
 * millisecond, and there are more than twenty rules, so a walk per rule
 * would be a second of pure repetition.
 */
function collectNodes(sourceFile: SourceFile): FileNodes {
  const byKind = new Map<number, Node[]>();

  const walk = (node: Node): void => {
    const bucket = byKind.get(node.kind);
    if (bucket) bucket.push(node);
    else byKind.set(node.kind, [node]);

    node.forEachChild(walk);
  };

  walk(sourceFile);
  return { byKind };
}

/**
 * The line and the column of a node, one-based.
 *
 * The compiler counts positions in UTF-16 code units, which is what the
 * text of the file is in, so the arithmetic is the same on both sides.
 */
function positionOf(
  sourceFile: SourceFile,
  node: Node,
  file: string,
): Position {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { file, line: line + 1, column: character + 1 };
}

/**
 * Check the project, and report what is wrong with it.
 *
 * The types come from `tsrs`, in one batched round trip per file. A type
 * query on its own costs a tenth of a millisecond, and a file has
 * thousands of nodes the rules ask about, so the batching is the
 * difference between a second and a minute.
 */
export async function lintProject(options: LintOptions): Promise<Finding[]> {
  const selected = options.rules ?? rules;
  const cwd = options.cwd;
  const session: Session = await openSession(cwd, options.tsconfig);
  const overrides = await readOverrides(cwd);
  const findings: Finding[] = [];

  try {
    const all = await session.files();
    // An explicit list is the caller's choice; the default is the
    // project's own files.
    const files =
      options.files ?? all.filter((path) => isProjectFile(path, cwd));

    for (const file of files) {
      const sourceFile = await session.sourceFile(file);
      if (!sourceFile) continue;

      const nodes = collectNodes(sourceFile);
      const text = sourceFile.text;
      const disables = readDisables(text);

      // The configuration says which rules are off for this file.
      const disabled = disabledRules(overrides, file, cwd);
      const active = enabledRules(selected, disabled);

      // Every rule says what it is about and what it needs the types of,
      // before the checker is asked for anything.
      const wanted: Node[] = [];
      const plans = active.map((rule) => {
        const plan = rule.select(nodes);
        wanted.push(...plan.wanted);
        return { rule, about: plan.about };
      });

      const types = await session.typesOf(wanted);
      const byNode = new Map<Node, (typeof types)[number]>();
      wanted.forEach((node, index) => {
        const type = types[index];
        if (type !== undefined) byNode.set(node, type);
      });

      for (const { rule } of plans) {
        await rule.report({
          file,
          nodes,
          typeOf: (node) => byNode.get(node),
          checker: session.checker,
          text,
          report: (ruleName, node, message) => {
            const position = positionOf(sourceFile, node, file);
            // A comment that turns the rule off turns it off here too.
            if (isDisabled(disables, ruleName, position.line)) return;
            findings.push({ rule: ruleName, message, ...position });
          },
        });
      }
    }
  } finally {
    await session.close();
  }

  return findings;
}

/** The tsconfig of the project, by convention. */
export function defaultTsconfig(cwd: string): string {
  return join(cwd, "tsconfig.json");
}

/**
 * The project's own files, as the checker has them.
 *
 * The program holds the whole dependency graph — every package's type
 * declarations are in it — and the declarations are not this code.
 */
export function projectFiles(files: readonly string[], cwd: string): string[] {
  return files.filter((path) => isProjectFile(path, cwd));
}
