#!/usr/bin/env bun
/// <reference types="bun-types" />
// Coverage gate for `bun test --coverage`.
// Single test run, robust regex parse, JSON artifact + CI step summary.
// Thresholds overridable: MIN_COVERAGE_FUNCS / MIN_COVERAGE_LINES.
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const MIN_FUNCS = Number(process.env.MIN_COVERAGE_FUNCS ?? 70);
const MIN_LINES = Number(process.env.MIN_COVERAGE_LINES ?? 80);

const proc = Bun.spawn(["bun", "test", "--coverage"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
const output = `${stdout}\n${stderr}`;

if (exitCode !== 0) {
  console.error(output);
  console.error(`❌ bun test failed (exit ${exitCode})`);
  process.exit(exitCode);
}

const match = output.match(/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/);
if (!match) {
  console.error(output);
  console.error("❌ Could not parse 'All files' coverage row.");
  process.exit(1);
}

const funcs = Number(match[1]);
const lines = Number(match[2]);
const pass = funcs >= MIN_FUNCS && lines >= MIN_LINES;

console.log(
  `📊 Coverage: ${funcs}% funcs (min ${MIN_FUNCS}%), ${lines}% lines (min ${MIN_LINES}%)`,
);

await mkdir(".bundle", { recursive: true });
await writeFile(
  join(".bundle", "coverage-summary.json"),
  `${JSON.stringify(
    {
      funcs,
      lines,
      minFuncs: MIN_FUNCS,
      minLines: MIN_LINES,
      pass,
      at: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  await appendFile(
    summaryFile,
    `## Coverage\n\n| Metric | Actual | Minimum | Status |\n|---|---|---|---|\n| Functions | ${funcs}% | ${MIN_FUNCS}% | ${funcs >= MIN_FUNCS ? "✅" : "❌"} |\n| Lines | ${lines}% | ${MIN_LINES}% | ${lines >= MIN_LINES ? "✅" : "❌"} |\n`,
  );
}

if (!pass) {
  console.error("⚠️ Coverage below threshold — add tests before merging.");
  process.exit(1);
}
console.log("✅ Coverage thresholds satisfied.");
