#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Move the Next.js canary forward.
 *
 * The canary is a moving target, and the repository's supply-chain cooldown
 * (`minimumReleaseAge` in `bunfig.toml`) rejects anything published in the
 * last three days. So adopting a new canary is two edits in step: the
 * version in `package.json`, and the set of version-scoped exemptions that
 * let that exact build — and the ten `@next/*` packages that publish
 * alongside it — past the cooldown.
 *
 * Doing that by hand means keeping two lists in step, and a missing entry
 * fails the install with a message that does not point at the cause. So the
 * list is derived from the published manifest instead: every dependency
 * pinned to exactly the canary's own version is a package that published at
 * the same moment, and therefore needs its own exemption.
 *
 *   bun run bump:next-canary              # move to the current canary
 *   bun run bump:next-canary -- --dry-run # show what would change
 *
 * The exemptions stay version-scoped on purpose. A blanket package exemption
 * would let any future build of `next` past the cooldown, which is the whole
 * thing the cooldown is for: a compromised release is caught and yanked
 * inside that window.
 */
import { readFile } from "bun:fs/promises";
import { join } from "bun:path";

const ROOT = join(import.meta.dir, "..");
const REGISTRY = "https://registry.npmjs.org";

/**
 * The shape of the parts of a published manifest this script reads.
 */
type NextManifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/**
 * An entry of `minimumReleaseAgeExcludes` that belongs to the Next.js canary.
 *
 * The whole `name@version` is captured, so the entry can be compared and
 * rewritten rather than merely recognised.
 */
const NEXT_CANARY_ENTRY = /^(\s*)"((?:next|@next\/[a-z0-9-]+)@[^"]+)"(,?)\s*$/;

/** The latest canary the registry publishes for Next.js. */
export async function latestCanary(): Promise<string> {
  const response = await fetch(`${REGISTRY}/-/package/next/dist-tags`);
  if (!response.ok) {
    throw new Error(
      `the registry did not return the dist-tags (HTTP ${response.status})`,
    );
  }
  const tags = (await response.json()) as { canary?: string };
  if (!tags.canary) throw new Error("the registry has no `canary` dist-tag");
  return tags.canary;
}

/** The published manifest for one version. */
export async function manifestFor(version: string): Promise<NextManifest> {
  const response = await fetch(`${REGISTRY}/next/${version}`);
  if (!response.ok) {
    throw new Error(
      `the registry did not return ${version} (HTTP ${response.status})`,
    );
  }
  return (await response.json()) as NextManifest;
}

/**
 * The exemptions a canary build needs.
 *
 * A dependency only needs one when it was published at exactly the same
 * version, because those are the ones the cooldown would otherwise reject.
 * A dependency on a version range — `sharp`, `postcss`, `caniuse-lite` — is
 * resolved to something the cooldown already allows.
 */
export function canaryExclusions(
  manifest: NextManifest,
  version: string,
): string[] {
  const entries = new Set<string>([`next@${version}`]);

  const published = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  };
  for (const [name, range] of Object.entries(published)) {
    if (range === version) entries.add(`${name}@${version}`);
  }

  return [...entries].sort();
}

/**
 * Replace the Next.js canary exemptions in `bunfig.toml`.
 *
 * The file is edited as text rather than through a TOML writer, because the
 * comments next to these entries explain why they are there, and a writer
 * would drop them.
 */
export function patchExcludes(source: string, entries: string[]): string {
  const lines = source.split("\n");

  const start = lines.findIndex((line) =>
    /^\s*minimumReleaseAgeExcludes\s*=\s*\[/.test(line),
  );
  if (start === -1) {
    throw new Error("bunfig.toml has no minimumReleaseAgeExcludes array");
  }

  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new Error("the minimumReleaseAgeExcludes array is not closed");
  }

  const kept: string[] = [];
  let replaced = false;

  for (const line of lines.slice(start + 1, end)) {
    const match = NEXT_CANARY_ENTRY.exec(line);
    if (!match) {
      kept.push(line);
      continue;
    }
    if (replaced) continue;

    replaced = true;
    const indent = match[1] ?? "  ";
    for (const entry of entries) kept.push(`${indent}"${entry}",`);
  }

  if (!replaced) {
    throw new Error(
      "bunfig.toml has no Next.js canary exemptions to replace — add them " +
        "by hand, or restore the entries this script manages",
    );
  }

  return [...lines.slice(0, start + 1), ...kept, ...lines.slice(end)].join(
    "\n",
  );
}

/**
 * The Next.js canary exemptions already in `bunfig.toml`.
 *
 * Read back so the script can tell "the version moved" from "the exemption
 * list moved" from "nothing moved", and so a re-run is a no-op rather than a
 * rewrite.
 */
export function currentCanaryEntries(source: string): string[] {
  const lines = source.split("\n");
  const entries: string[] = [];

  for (const line of lines) {
    const match = NEXT_CANARY_ENTRY.exec(line);
    if (match) entries.push(match[2]);
  }
  return entries;
}

/** Point the `next` dependency at a version. */
export function patchPackageJson(source: string, version: string): string {
  const pattern = /("next"\s*:\s*")([^"]+)(")/;
  if (!pattern.test(source)) {
    throw new Error("package.json has no `next` dependency to update");
  }
  // A function, not a replacement string: a version is data, and a `$` in it
  // must not be read as a capture reference.
  return source.replace(
    pattern,
    (_match, before: string, _old: string, after: string) =>
      `${before}${version}${after}`,
  );
}

async function main(): Promise<number> {
  const dryRun = Bun.argv.includes("--dry-run");
  const version = await latestCanary();
  const manifest = await manifestFor(version);
  const entries = canaryExclusions(manifest, version);

  const packageJsonPath = join(ROOT, "package.json");
  const bunfigPath = join(ROOT, "bunfig.toml");

  const packageJson = await readFile(packageJsonPath, "utf-8");
  const bunfig = await readFile(bunfigPath, "utf-8");

  const nextPackageJson = patchPackageJson(packageJson, version);
  const nextBunfig = patchExcludes(bunfig, entries);

  console.log(`Next.js canary: ${version}`);
  console.log(`Exemptions needed (${entries.length}):`);
  for (const entry of entries) console.log(`  ${entry}`);

  const currentEntries = currentCanaryEntries(bunfig);
  const versionChanged = nextPackageJson !== packageJson;
  const entriesChanged =
    currentEntries.length !== entries.length ||
    currentEntries.some((entry, i) => entry !== entries[i]);

  if (!versionChanged && !entriesChanged) {
    console.log("\n✔ Already up to date.");
    return 0;
  }

  if (versionChanged) console.log(`\nnext: ${version}`);
  if (entriesChanged) {
    console.log(`exemptions: ${currentEntries.length} → ${entries.length}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing was written.");
    return 0;
  }

  await Bun.write(packageJsonPath, nextPackageJson);
  await Bun.write(bunfigPath, nextBunfig);
  console.log("\n✔ package.json and bunfig.toml updated.");

  const install = await Bun.$`bun install --ignore-scripts`.nothrow().quiet();
  if (install.exitCode !== 0) {
    console.error("✘ `bun install` failed. See the output above.");
    return install.exitCode;
  }

  console.log("\nNext: `bun run verify:delivery`.");
  return 0;
}

// `import.meta.main` is true only when this file is the entry point, so
// importing the module (from a test, say) does not touch the repository.
if (import.meta.main) {
  // `process.exitCode` rather than `process.exit()`: Bun flushes pending
  // writes before the process ends, so the report is never truncated when the
  // output is piped into a CI log.
  process.exitCode = await main();
}
