#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Coverage gate for `bun test --coverage`.
 *
 * Bun owns the measurement and the reporting; this script owns the
 * decision. It reads the lcov artifact Bun writes, applies the thresholds,
 * and publishes the result to CI.
 *
 * Why the lcov file and not the console table: the console table is a
 * human-readable rendering, and its shape is not an interface — a regular
 * expression over it breaks the day the columns are re-aligned. The lcov
 * file is a data format with named fields, so the numbers compared here come
 * from `FNF`/`FNH`/`LF`/`LH` records instead.
 *
 * The aggregate is the mean of the per-file percentages, which is precisely
 * what Bun's own "All files" row reports. The gate therefore compares the
 * same numbers it has always compared — it just reads them from a stable
 * source instead of from a table.
 *
 * Thresholds:
 *   MIN_COVERAGE_FUNCS       aggregate function coverage, default 85
 *   MIN_COVERAGE_LINES       aggregate line coverage, default 85
 *   COVERAGE_MIN_FILE_FUNCS  per-file function floor, default 80 (0 disables)
 *   COVERAGE_MIN_FILE_LINES  per-file line floor, default 70 (0 disables)
 *
 * The per-file floor is the stricter of the two, and it is the one that
 * catches the failure the aggregate hides: a file that nothing imports any
 * more drops out of the report entirely, and the average barely moves. A
 * floor says that every file in the report has to carry its own weight.
 */
import { join } from "bun:path";

export const MIN_FUNCS = Number(Bun.env.MIN_COVERAGE_FUNCS ?? 85);
export const MIN_LINES = Number(Bun.env.MIN_COVERAGE_LINES ?? 85);
export const MIN_FILE_FUNCS = Number(Bun.env.COVERAGE_MIN_FILE_FUNCS ?? 80);
export const MIN_FILE_LINES = Number(Bun.env.COVERAGE_MIN_FILE_LINES ?? 70);

/**
 * Where the lcov report is written.
 *
 * The report is always produced, not only in CI: the gate reads the
 * aggregate from it, so the artifact is an input to the decision rather than
 * an optional extra.
 */
const LCOV_DIR = Bun.env.COVERAGE_LCOV_DIR ?? ".bundle/lcov";
const LCOV_PATH = join(LCOV_DIR, "lcov.info");

/**
 * An optional JUnit XML report for the CI test UI and for Codecov.
 * Additive: the console output and the coverage table are still produced.
 */
const JUNIT_PATH = Bun.env.COVERAGE_JUNIT_PATH;

/** One file's coverage, as lcov records it. */
export type LcovFile = {
  file: string;
  /** Functions found, and functions hit. */
  funcsFound: number;
  funcsHit: number;
  /** Lines found, and lines hit. */
  linesFound: number;
  linesHit: number;
};

/**
 * Parse an lcov report.
 *
 * Only the four counters are read; the per-line `DA:` records are skipped,
 * because the gate compares coverage ratios and not the uncovered lines.
 */
export function parseLcov(text: string): LcovFile[] {
  const files: LcovFile[] = [];
  let current: LcovFile | null = null;

  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      current = {
        file: line.slice(3),
        funcsFound: 0,
        funcsHit: 0,
        linesFound: 0,
        linesHit: 0,
      };
      files.push(current);
      continue;
    }
    if (!current) continue;

    if (line.startsWith("FNF:")) current.funcsFound = Number(line.slice(4));
    else if (line.startsWith("FNH:")) current.funcsHit = Number(line.slice(4));
    else if (line.startsWith("LF:")) current.linesFound = Number(line.slice(3));
    else if (line.startsWith("LH:")) current.linesHit = Number(line.slice(3));
  }

  return files;
}

/** A file's coverage as percentages. */
function percentages(file: LcovFile): { funcs: number; lines: number } {
  return {
    funcs:
      file.funcsFound === 0 ? 100 : (file.funcsHit / file.funcsFound) * 100,
    lines:
      file.linesFound === 0 ? 100 : (file.linesHit / file.linesFound) * 100,
  };
}

export type CoverageSummary = {
  /** Mean of the per-file function percentages. */
  funcs: number;
  /** Mean of the per-file line percentages. */
  lines: number;
  files: number;
  /** The file with the lowest function coverage, and the lowest line coverage. */
  worstFuncs: { file: string; percent: number } | null;
  worstLines: { file: string; percent: number } | null;
};

/**
 * The aggregate, computed the way Bun's "All files" row computes it: the
 * mean of the per-file percentages.
 */
export function summarize(files: LcovFile[]): CoverageSummary {
  if (files.length === 0) {
    return {
      funcs: 0,
      lines: 0,
      files: 0,
      worstFuncs: null,
      worstLines: null,
    };
  }

  let funcTotal = 0;
  let lineTotal = 0;
  let worstFuncs: { file: string; percent: number } | null = null;
  let worstLines: { file: string; percent: number } | null = null;

  for (const file of files) {
    const { funcs, lines } = percentages(file);
    funcTotal += funcs;
    lineTotal += lines;
    if (!worstFuncs || funcs < worstFuncs.percent) {
      worstFuncs = { file: file.file, percent: funcs };
    }
    if (!worstLines || lines < worstLines.percent) {
      worstLines = { file: file.file, percent: lines };
    }
  }

  return {
    funcs: funcTotal / files.length,
    lines: lineTotal / files.length,
    files: files.length,
    worstFuncs,
    worstLines,
  };
}

/** Append `data` to `path`. */
async function appendFile(path: string, data: string): Promise<void> {
  const existing = await Bun.file(path)
    .text()
    .catch(() => "");
  await Bun.write(path, existing + data);
}

async function main(): Promise<number> {
  const extraArgs = [
    // `text` has to be named explicitly: the lcov reporter otherwise
    // replaces the console table.
    "--coverage-reporter=text",
    "--coverage-reporter=lcov",
    `--coverage-dir=${LCOV_DIR}`,
    ...(JUNIT_PATH
      ? ["--reporter=junit", `--reporter-outfile=${JUNIT_PATH}`]
      : []),
  ];

  // Bun's shell API rather than `child_process`: the command is escaped and
  // executed directly, with no intermediate shell and no Node.js process
  // API in the picture. `.nothrow()` keeps a failing test run from throwing
  // before the output has been reported.
  const { stdout, stderr, exitCode } =
    await Bun.$`bun test __tests__ --coverage ${extraArgs}`.nothrow().quiet();

  const output = `${stdout.toString()}\n${stderr.toString()}`;

  if (exitCode !== 0) {
    console.error(output);
    console.error(`❌ bun test failed (exit ${exitCode})`);
    return exitCode;
  }

  const lcov = await Bun.file(LCOV_PATH)
    .text()
    .catch(() => null);
  if (lcov === null) {
    console.error(output);
    console.error(`❌ Could not read the coverage report at ${LCOV_PATH}.`);
    return 1;
  }

  const files = parseLcov(lcov);
  const summary = summarize(files);
  const funcs = Number(summary.funcs.toFixed(2));
  const lines = Number(summary.lines.toFixed(2));

  const pass = funcs >= MIN_FUNCS && lines >= MIN_LINES;

  // The per-file floor is the stricter gate: the aggregate can hide a file
  // that is entirely untested. A floor of zero turns it off.
  const fileFailures: string[] = [];
  if (MIN_FILE_FUNCS > 0) {
    for (const file of files) {
      const { funcs: fileFuncs } = percentages(file);
      if (fileFuncs < MIN_FILE_FUNCS) {
        fileFailures.push(
          `${file.file}: ${fileFuncs.toFixed(2)}% functions (min ${MIN_FILE_FUNCS}%)`,
        );
      }
    }
  }
  if (MIN_FILE_LINES > 0) {
    for (const file of files) {
      const { lines: fileLines } = percentages(file);
      if (fileLines < MIN_FILE_LINES) {
        fileFailures.push(
          `${file.file}: ${fileLines.toFixed(2)}% lines (min ${MIN_FILE_LINES}%)`,
        );
      }
    }
  }
  const filesPass = fileFailures.length === 0;

  console.log(
    `📊 Coverage: ${funcs}% funcs (min ${MIN_FUNCS}%), ${lines}% lines (min ${MIN_LINES}%)`,
  );
  if (summary.worstFuncs) {
    console.log(
      `   Weakest file: ${summary.worstFuncs.file} — ${summary.worstFuncs.percent.toFixed(2)}% funcs` +
        (summary.worstLines &&
        summary.worstLines.file !== summary.worstFuncs.file
          ? `, ${summary.worstLines.file} — ${summary.worstLines.percent.toFixed(2)}% lines`
          : ""),
    );
  }

  await Bun.write(
    join(".bundle", "coverage-summary.json"),
    `${JSON.stringify(
      {
        funcs,
        lines,
        minFuncs: MIN_FUNCS,
        minLines: MIN_LINES,
        minFileFuncs: MIN_FILE_FUNCS,
        minFileLines: MIN_FILE_LINES,
        files: summary.files,
        pass: pass && filesPass,
        worstFuncs: summary.worstFuncs,
        worstLines: summary.worstLines,
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );

  const summaryFile = Bun.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const floorRows =
      MIN_FILE_FUNCS > 0 || MIN_FILE_LINES > 0
        ? `\n| Per-file functions | ${summary.worstFuncs?.percent.toFixed(2) ?? 0}% (weakest) | ${MIN_FILE_FUNCS > 0 ? `${MIN_FILE_FUNCS}%` : "off"} | ${MIN_FILE_FUNCS > 0 && (summary.worstFuncs?.percent ?? 0) >= MIN_FILE_FUNCS ? "✅" : "❌"} |\n| Per-file lines | ${summary.worstLines?.percent.toFixed(2) ?? 0}% (weakest) | ${MIN_FILE_LINES > 0 ? `${MIN_FILE_LINES}%` : "off"} | ${MIN_FILE_LINES > 0 && (summary.worstLines?.percent ?? 0) >= MIN_FILE_LINES ? "✅" : "❌"} |`
        : "";
    await appendFile(
      summaryFile,
      `## Coverage\n\n| Metric | Actual | Minimum | Status |\n|---|---|---|---|\n| Functions | ${funcs}% | ${MIN_FUNCS}% | ${funcs >= MIN_FUNCS ? "✅" : "❌"} |\n| Lines | ${lines}% | ${MIN_LINES}% | ${lines >= MIN_LINES ? "✅" : "❌"} |${floorRows}\n`,
    );
  }

  if (!pass) {
    console.error("⚠️ Coverage below threshold — add tests before merging.");
    return 1;
  }
  if (!filesPass) {
    console.error(
      `⚠️ Coverage below the per-file floor:\n${fileFailures.map((f) => `  ${f}`).join("\n")}`,
    );
    return 1;
  }
  console.log("✅ Coverage thresholds satisfied.");
  return 0;
}

// `process.exitCode` rather than `process.exit()`: Bun flushes pending
// writes before the process ends, so the report and the artifact are never
// truncated when the output is piped into a CI log.
if (import.meta.main) {
  process.exitCode = await main();
}
