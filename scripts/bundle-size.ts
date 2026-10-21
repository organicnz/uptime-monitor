#!/usr/bin/env bun
/// <reference types="bun-types" />
// Bundle-size gate for the Next.js build output.
// Bun-native gzip accounting (Bun.gzipSync — zero new dependencies).
// Compares against committed `.bundle/baseline.json`; fails if gzip total
// grows more than MAX_BUNDLE_GROWTH_PCT (default 10).
// Run `bun scripts/bundle-size.ts --update` after an intentional size change
// to refresh the committed baseline.
import { readFile, stat } from "bun:fs/promises";
import { join } from "bun:path";

const ROOT = join(import.meta.dir, "..");
const NEXT_DIR = join(ROOT, ".next");
const BUNDLE_DIR = join(ROOT, ".bundle");
const BASELINE_PATH = join(BUNDLE_DIR, "baseline.json");
const SIZE_PATH = join(BUNDLE_DIR, "size.json");
const MAX_GROWTH_PCT = Number(Bun.env.MAX_BUNDLE_GROWTH_PCT ?? 10);
// `Bun.argv`, not `process.argv`: the same object, but it is Bun's own API
// rather than a Node.js compatibility shim.
const UPDATE = Bun.argv.includes("--update");

type FileEntry = { raw: number; gzip: number };

/**
 * Directory names that hold the build's scratch space rather than its
 * output. They are excluded at any depth, which is what the previous
 * hand-rolled walk did.
 */
const EXCLUDED_DIRS = new Set(["cache", "dev"]);

function isExcluded(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => EXCLUDED_DIRS.has(segment));
}

/**
 * Every file in the build output, with its raw and gzipped size.
 *
 * `Bun.Glob` does the traversal. It is the runtime's own matcher, so it
 * walks the tree once and hands back the paths that match, instead of
 * reading every directory entry and stat-ing it afterwards.
 *
 * `followSymlinks` is on because the build output contains them:
 * `.next/node_modules` holds a symlink per traced package, and the traced
 * packages are part of what the server ships. Following them is what makes
 * this the same measurement the previous hand-rolled walk took, and it
 * takes less time to do it.
 */
const BUILD_OUTPUT = new Bun.Glob("**/*");

async function collectSizes(): Promise<Map<string, FileEntry>> {
  const files = new Map<string, FileEntry>();

  for (const relative of BUILD_OUTPUT.scanSync({
    cwd: NEXT_DIR,
    onlyFiles: true,
    followSymlinks: true,
  })) {
    if (isExcluded(relative)) continue;
    const bytes = await Bun.file(join(NEXT_DIR, relative)).bytes();
    files.set(relative, {
      raw: bytes.length,
      gzip: Bun.gzipSync(bytes).length,
    });
  }

  return files;
}

async function main(): Promise<number> {
  const dirStat = await stat(NEXT_DIR).catch(() => null);
  if (!dirStat?.isDirectory()) {
    console.error("❌ .next directory not found — run `bun run build` first.");
    return 1;
  }

  const files = await collectSizes();

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const { raw, gzip } of files.values()) {
    rawBytes += raw;
    gzipBytes += gzip;
  }
  const top = [...files.entries()]
    .sort((a, b) => b[1].gzip - a[1].gzip)
    .slice(0, 10);

  console.log(
    `📦 Bundle: ${files.size} files, ${(rawBytes / 1024).toFixed(1)} KiB raw, ${(gzipBytes / 1024).toFixed(1)} KiB gzip`,
  );
  console.log(
    Bun.inspect.table(
      top.map(([file, size]) => ({
        file,
        gzip: `${(size.gzip / 1024).toFixed(1)} KiB`,
        raw: `${(size.raw / 1024).toFixed(1)} KiB`,
      })),
    ),
  );

  const sortedFiles = [...files.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const byFile = Object.fromEntries(sortedFiles);
  // Full snapshot for the CI artifact (human triage + trend data).
  const snapshot = {
    gzipBytes,
    rawBytes,
    files: files.size,
    at: new Date().toISOString(),
    top: top.map(([file, s]) => ({ file, ...s })),
    byFile,
  };
  // Slim committed baseline: totals + per-file map only (no timestamps or
  // derivable top-lists, so diffs stay meaningful).
  const baselineSnapshot = { gzipBytes, rawBytes, files: files.size, byFile };

  // `Bun.write` creates the parent directory if it is missing, so there is
  // no separate `mkdir` step to keep in step with the paths below.
  await Bun.write(SIZE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

  const summaryFile = Bun.env.GITHUB_STEP_SUMMARY;
  async function summarize(extra: string) {
    if (!summaryFile) return;
    const rows = top
      .map(([f, s]) => `| \`${f}\` | ${(s.gzip / 1024).toFixed(1)} KiB |`)
      .join("\n");
    const existing = await Bun.file(summaryFile)
      .text()
      .catch(() => "");
    await Bun.write(
      summaryFile,
      `${existing}## Bundle size\n\nTotal gzip: **${(gzipBytes / 1024).toFixed(1)} KiB** (${files.size} files)\n\n${extra}\n\n| Largest files | gzip |\n|---|---|\n${rows}\n`,
    );
  }

  const baselineRaw = await readFile(BASELINE_PATH, "utf8").catch(() => null);
  if (UPDATE || !baselineRaw) {
    await Bun.write(
      BASELINE_PATH,
      `${JSON.stringify(baselineSnapshot, null, 2)}\n`,
    );
    console.log(
      baselineRaw
        ? "📌 Baseline updated — commit `.bundle/baseline.json`."
        : "📌 No baseline found — created `.bundle/baseline.json`. Commit it to enable the guard.",
    );
    await summarize("ℹ️ Baseline recorded on this run.");
    return 0;
  }

  const baseline = JSON.parse(baselineRaw) as {
    gzipBytes: number;
    byFile?: Record<string, FileEntry>;
  };
  const growthPct =
    ((gzipBytes - baseline.gzipBytes) / baseline.gzipBytes) * 100;
  console.log(
    `📈 Growth vs baseline: ${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(2)}% (limit +${MAX_GROWTH_PCT}%)`,
  );

  // Per-file growth attribution for fast triage.
  const growers = baseline.byFile
    ? [...files.entries()]
        .map(([f, s]) => ({
          file: f,
          delta: s.gzip - (baseline.byFile?.[f]?.gzip ?? 0),
          gzip: s.gzip,
        }))
        .filter((g) => g.delta > 0)
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5)
    : [];
  const detail =
    growthPct > MAX_GROWTH_PCT && growers.length
      ? `Top growers:\n${growers.map((g) => `  +${(g.delta / 1024).toFixed(1)} KiB  ${g.file}`).join("\n")}`
      : "";
  if (detail) console.log(detail);
  await summarize(
    growthPct > MAX_GROWTH_PCT
      ? `❌ Growth **+${growthPct.toFixed(2)}%** exceeds +${MAX_GROWTH_PCT}% limit.\n\`\`\`\n${detail}\n\`\`\``
      : `✅ Growth **${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(2)}%** within +${MAX_GROWTH_PCT}% limit.`,
  );

  if (growthPct > MAX_GROWTH_PCT) {
    console.error(
      `❌ Bundle grew +${growthPct.toFixed(2)}% (>+${MAX_GROWTH_PCT}%). If intentional, run \`bun run bundle-size:update\` and commit the new baseline.`,
    );
    return 1;
  }
  console.log("✅ Bundle size within budget.");
  return 0;
}

// `process.exitCode` rather than `process.exit()`: Bun flushes pending writes
// before the process ends, so the report and the artifact are never truncated
// when the output is piped into a CI log.
process.exitCode = await main();
