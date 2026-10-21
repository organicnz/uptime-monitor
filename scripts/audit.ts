#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Dependency audit gate.
 *
 * `bun audit --json` is the source of truth: it reports the advisories as
 * data, keyed by package, with a record per advisory. The old gate ran the
 * human-readable output and grepped it for the sentence "No
 * vulnerabilities found", which fails in both directions — it stops
 * detecting a vulnerability when the wording changes, and it fails a clean
 * build when the wording changes.
 *
 * The suppressed advisories are listed here, each with a reason, rather
 * than in the workflow. A suppression that lives in a YAML file is
 * invisible in a code review; one that lives in code is a line in a diff,
 * and it is the line someone has to argue with when the reason stops
 * being true. The suppressed advisories are always printed, so the report
 * never hides them.
 */

/**
 * Advisories that are reported but do not fail the build.
 *
 * The key is the GHSA identifier, which is what `bun audit --ignore`
 * takes. The value is the reason, and the reason is the point: a
 * suppression without one is a hole in the gate.
 */
export const IGNORED: Record<string, string> = {
  "GHSA-jm63-cq47-j5jp":
    "@modelcontextprotocol/server is pinned to exactly 2.0.0 by every published " +
    "vgpu release (0.5.0 and 0.6.0), so there is no version to upgrade to. The " +
    "package backs vgpu's MCP server CLI; the application imports vgpu's " +
    "WebGPU runtime and never that CLI.",
  "GHSA-46jr-4wx8-v453":
    "Same package and same pin: @modelcontextprotocol/server 2.0.0 is what vgpu " +
    "requires, and it is used only by vgpu's MCP CLI, not by the WebGPU runtime " +
    "the application imports.",
  "GHSA-rvq5-wwqv-78pq":
    "Same package and same pin: @modelcontextprotocol/server 2.0.0 is what vgpu " +
    "requires, and it is used only by vgpu's MCP CLI, not by the WebGPU runtime " +
    "the application imports.",
};

/** An advisory, as `bun audit --json` reports it. */
type Advisory = {
  id: number;
  url: string;
  title: string;
  severity: string;
  vulnerable_versions: string;
};

type AuditReport = Record<string, Advisory[]>;

/** The GHSA identifier of an advisory, which is the last path segment of its URL. */
function advisoryId(advisory: Advisory): string {
  return advisory.url.split("/").pop() ?? String(advisory.id);
}

async function main(): Promise<number> {
  const report = await Bun.$`bun audit --json`.nothrow().quiet();

  if (report.exitCode !== 0 && report.stdout.toString().trim() === "") {
    console.error(report.stderr.toString());
    console.error("❌ `bun audit` could not run.");
    return report.exitCode === 0 ? 1 : report.exitCode;
  }

  let parsed: AuditReport;
  try {
    parsed = JSON.parse(report.stdout.toString()) as AuditReport;
  } catch {
    console.error(report.stdout.toString());
    console.error("❌ Could not parse the `bun audit --json` report.");
    return 1;
  }

  const reported = Object.entries(parsed).flatMap(([pkg, advisories]) =>
    advisories.map((advisory) => ({ pkg, advisory })),
  );

  const failing = reported.filter(
    ({ advisory }) => !(advisoryId(advisory) in IGNORED),
  );
  const suppressed = reported.filter(
    ({ advisory }) => advisoryId(advisory) in IGNORED,
  );

  if (suppressed.length > 0) {
    console.log(
      `\nℹ️ ${suppressed.length} advisory(ies) suppressed with a documented reason:\n`,
    );
    for (const { pkg, advisory } of suppressed) {
      console.log(`  ${advisoryId(advisory)} (${pkg}) — ${advisory.title}`);
      console.log(`    ${IGNORED[advisoryId(advisory)]}\n`);
    }
  }

  if (failing.length === 0) {
    console.log(
      `✔ No vulnerabilities found${suppressed.length > 0 ? ` (${suppressed.length} suppressed)` : ""}.`,
    );
    return 0;
  }

  console.error("❌ Vulnerabilities found:\n");
  for (const { pkg, advisory } of failing) {
    console.error(`  ${pkg} — ${advisory.severity}: ${advisory.title}`);
    console.error(`    ${advisory.url}`);
    console.error(`    vulnerable: ${advisory.vulnerable_versions}\n`);
  }
  console.error(
    "Fix with `bun audit fix`, or record a reason in scripts/audit.ts if there is no version to move to.",
  );
  return 1;
}

// `process.exitCode` rather than `process.exit()`: Bun flushes pending
// writes before the process ends, so the report is never truncated when
// the output is piped into a CI log.
if (import.meta.main) {
  process.exitCode = await main();
}
