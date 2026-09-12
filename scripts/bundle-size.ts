#!/usr/bin/env bun
/// <reference types="bun-types" />
// Bundle-size gate for the Next.js build output.
// Bun-native gzip accounting (Bun.gzipSync — zero new dependencies).
// Compares against committed `.bundle/baseline.json`; fails if gzip total
// grows more than MAX_BUNDLE_GROWTH_PCT (default 10).
// Run `bun scripts/bundle-size.ts --update` after an intentional size change
// to refresh the committed baseline.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";

const NEXT_DIR = join(process.cwd(), ".next");
const BUNDLE_DIR = join(process.cwd(), ".bundle");
const BASELINE_PATH = join(BUNDLE_DIR, "baseline.json");
const SIZE_PATH = join(BUNDLE_DIR, "size.json");
const MAX_GROWTH_PCT = Number(process.env.MAX_BUNDLE_GROWTH_PCT ?? 10);
const UPDATE = process.argv.includes("--update");

type FileEntry = { raw: number; gzip: number };

async function walk(dir: string, out: Map<string, FileEntry>): Promise<void> {
  for (const name of await readdir(dir)) {
    if (name === "cache") continue; // build cache is non-deterministic
    const full = join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) {
      await walk(full, out);
    } else if (st.isFile()) {
      const bytes = new Uint8Array(await Bun.file(full).arrayBuffer());
      out.set(relative(NEXT_DIR, full), {
        raw: bytes.length,
        gzip: Bun.gzipSync(bytes).length,
      });
    }
  }
}

const dirStat = await stat(NEXT_DIR).catch(() => null);
if (!dirStat?.isDirectory()) {
  console.error("❌ .next directory not found — run `bun run build` first.");
  process.exit(1);
}

const files = new Map<string, FileEntry>();
await walk(NEXT_DIR, files);

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

await mkdir(BUNDLE_DIR, { recursive: true });
await writeFile(SIZE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
async function summarize(extra: string) {
  if (!summaryFile) return;
  const { appendFile } = await import("node:fs/promises");
  const rows = top
    .map(([f, s]) => `| \`${f}\` | ${(s.gzip / 1024).toFixed(1)} KiB |`)
    .join("\n");
  await appendFile(
    summaryFile,
    `## Bundle size\n\nTotal gzip: **${(gzipBytes / 1024).toFixed(1)} KiB** (${files.size} files)\n\n${extra}\n\n| Largest files | gzip |\n|---|---|\n${rows}\n`,
  );
}

const baselineRaw = await readFile(BASELINE_PATH, "utf8").catch(() => null);
if (UPDATE || !baselineRaw) {
  await writeFile(
    BASELINE_PATH,
    `${JSON.stringify(baselineSnapshot, null, 2)}\n`,
  );
  console.log(
    baselineRaw
      ? "📌 Baseline updated — commit `.bundle/baseline.json`."
      : "📌 No baseline found — created `.bundle/baseline.json`. Commit it to enable the guard.",
  );
  await summarize("ℹ️ Baseline recorded on this run.");
  process.exit(0);
}

const baseline = JSON.parse(baselineRaw) as {
  gzipBytes: number;
  byFile?: Record<string, FileEntry>;
};
const growthPct = ((gzipBytes - baseline.gzipBytes) / baseline.gzipBytes) * 100;
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
  process.exit(1);
}
console.log("✅ Bundle size within budget.");
