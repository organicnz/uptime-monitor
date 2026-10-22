#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * The type-aware lint.
 *
 * The rules that need types — a promise nobody awaits, an `any` that came
 * off the network, an `await` of something that is not a promise — used to
 * run through the linter's own type checker. The type information comes
 * from `tsrs` here instead: the same Rust port of the TypeScript 7
 * compiler that `bun run typecheck` gates on, asked for the same answers
 * through the same program.
 *
 * That is the whole point. There is one type checker in this repository,
 * and it is the one that decides whether the code is correct.
 *
 * The output is the finding and the place it is, one per line, in the
 * shape the linter it replaces used:
 *
 *     path/to/file.ts:12:5
 *       error  Promises must be awaited, ...  @typescript-eslint/no-floating-promises
 *
 * The exit code is 1 when there is a finding and 0 when there is none,
 * which is what the gate needs.
 */
import { join, relative } from "bun:path";

import {
  defaultTsconfig,
  type Finding,
  lintProject,
} from "@/lib/type-aware-lint";

/** The findings, as the gate reads them. */
export type Report = {
  findings: Finding[];
  /** The files that were checked. */
  files: number;
};

/**
 * Check the project, and report what is wrong with it.
 *
 * The project is described by its own `tsconfig.json`, and the files are
 * the ones the compiler has in its program: the same set the type check
 * covers.
 */
export async function check(cwd: string): Promise<Report> {
  const findings = await lintProject({
    cwd,
    tsconfig: defaultTsconfig(cwd),
  });
  return {
    findings,
    files:
      findings.length === 0 ? 0 : new Set(findings.map((f) => f.file)).size,
  };
}

/** The finding, in the shape a gate reads. */
export function format(finding: Finding, cwd: string): string {
  const file = relative(cwd, finding.file);
  return (
    `${file}:${finding.line}:${finding.column}\n` +
    `  error  ${finding.message}  ${finding.rule}`
  );
}

/** Print the findings, and say how many there were. */
export function report(findings: Finding[], cwd: string): void {
  for (const finding of findings) {
    console.error(format(finding, cwd));
  }
  console.error(
    `\n${findings.length} finding${findings.length === 1 ? "" : "s"} from the type-aware rules.`,
  );
}

if (import.meta.main) {
  const cwd = join(import.meta.dir, "..");
  const { findings } = await check(cwd);
  report(findings, cwd);
  process.exitCode = findings.length === 0 ? 0 : 1;
}
