#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Keep CLAUDE.md in sync with AGENTS.md.
 *
 * Next.js writes its own guidance into `AGENTS.md`: the `nextjs-agent-rules`
 * block, and, as of 16.5, the `nextjs-agent-upgrade` block as well. Those
 * blocks are the framework's to manage — it rewrites them on every `next dev`
 * and every `next build`, and it rewrites them again when the installed
 * version changes what they say.
 *
 * This repository keeps a second copy of the same document under the other
 * name, because the two agents read different files. That copy is AGENTS.md
 * *minus* the managed blocks: the framework's blocks belong to AGENTS.md, and
 * a second copy of them would be a second copy of something the framework is
 * about to rewrite.
 *
 * So the copy is generated, not maintained by hand:
 *
 *   bun run agent-docs:sync          regenerate CLAUDE.md
 *   bun run agent-docs:sync -- --check  fail if the two have drifted
 *
 * The pre-commit hook runs the sync, and a unit test runs the check, so a
 * `next dev` that rewrote the blocks cannot leave the pair out of step.
 */
import { readFile } from "bun:fs/promises";
import { join } from "bun:path";

const ROOT = join(import.meta.dir, "..");

/**
 * Every block Next.js manages inside AGENTS.md.
 *
 * The set is read from the installed framework rather than hard-coded one
 * block at a time, because the framework adds them: 16.5 introduced the
 * upgrade block, and the feedback block is opt-in. A block that is not
 * present is simply not there to strip.
 */
const MANAGED_BLOCKS: [string, string][] = [
  ["<!-- BEGIN:nextjs-agent-rules -->", "<!-- END:nextjs-agent-rules -->"],
  [
    "<!-- BEGIN:nextjs-agent-feedback -->",
    "<!-- END:nextjs-agent-feedback -->",
  ],
  ["<!-- BEGIN:nextjs-agent-upgrade -->", "<!-- END:nextjs-agent-upgrade -->"],
];

/**
 * Remove the framework's managed blocks.
 *
 * Line-based rather than index-based, so a block that is not closed does not
 * swallow the rest of the document.
 */
export function stripManagedBlocks(source: string): string {
  const out: string[] = [];
  let inside: string | null = null;
  // The blank line that separates a block from the prose around it belongs
  // to the block, not to the prose.
  let skipBlank = false;

  for (const line of source.split("\n")) {
    const trimmed = line.trim();

    if (inside === null) {
      const opening = MANAGED_BLOCKS.find(([start]) => trimmed === start);
      if (opening) {
        inside = opening[1];
        skipBlank = true;
        continue;
      }
      if (skipBlank && trimmed === "") {
        skipBlank = false;
        continue;
      }
      skipBlank = false;
      out.push(line);
      continue;
    }

    if (trimmed === inside) {
      inside = null;
      skipBlank = true;
    }
  }

  // The blocks sit at the end of the file, so the blank lines they leave
  // behind are trailing whitespace. One newline ends the file.
  return `${out.join("\n").replace(/\s+$/, "")}\n`;
}

/** The CLAUDE.md that AGENTS.md implies. */
export async function expectedClaudeMd(): Promise<string> {
  const agents = await readFile(join(ROOT, "AGENTS.md"), "utf-8");
  return stripManagedBlocks(agents);
}

async function main(): Promise<number> {
  const expected = await expectedClaudeMd();
  const current = await readFile(join(ROOT, "CLAUDE.md"), "utf-8");

  if (current === expected) {
    console.log("✔ CLAUDE.md is in sync with AGENTS.md");
    return 0;
  }

  if (Bun.argv.includes("--check")) {
    console.error("✘ CLAUDE.md is out of sync with AGENTS.md.");
    console.error("  Run `bun run agent-docs:sync` to regenerate it.");
    return 1;
  }

  await Bun.write(join(ROOT, "CLAUDE.md"), expected);
  console.log("✔ CLAUDE.md regenerated from AGENTS.md");
  return 0;
}

// `import.meta.main` is true only when this file is the entry point, so
// importing the module (from a test, say) does not rewrite anything.
if (import.meta.main) {
  // `process.exitCode` rather than `process.exit()`: Bun flushes pending
  // writes before the process ends, so the report is never truncated when the
  // output is piped into a CI log.
  process.exitCode = await main();
}
