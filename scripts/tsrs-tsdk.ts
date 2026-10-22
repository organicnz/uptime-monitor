#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Prepare the directory VS Code loads the TypeScript language server from.
 *
 * The editor's language server is the last program in the loop that is not
 * `tsrs`: by default VS Code starts the `typescript` package's server, which
 * is a Node.js program. `tsrs` has its own language server, and the
 * TypeScript extension will use it when the directory it is pointed at
 * holds an executable called `tsgo` or `tsc`.
 *
 * So this makes one: a symlink to the native binary, in a directory the
 * editor configuration names. The symlink is to the *native* binary rather
 * than to the `tsrs` launcher, because the launcher is a `#!/usr/bin/env
 * node` script and the editor starts the executable directly.
 *
 * The directory is regenerable, so it is not tracked.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "bun:fs";
import { join } from "bun:path";

/** Where the editor looks for the language server. */
export const TSDK_DIR = ".tsrs-tsdk";

/**
 * The native `tsrs` binary, whichever platform package it is in.
 *
 * The package is `@tsrs/<os>-<arch>`, and the binary is `tsrs` inside it,
 * so the platform is not something this has to know.
 */
export function findBinary(root: string): string | undefined {
  const packages = join(root, "node_modules", "@tsrs");
  if (!existsSync(packages)) return undefined;

  for (const entry of Array.from(
    new Bun.Glob("*/tsrs").scanSync({ cwd: packages, onlyFiles: true }),
  )) {
    const path = join(packages, entry);
    if (existsSync(path)) return path;
  }

  return undefined;
}

/**
 * Make the language server directory.
 *
 * A symlink where the platform allows one, and a copy where it does not:
 * creating a symlink on Windows needs a privilege the ordinary user does
 * not have, and a copy of a sixteen-megabyte binary is not the end of the
 * world.
 */
export function prepare(root: string): string {
  const binary = findBinary(root);
  if (!binary) {
    throw new Error(
      "The tsrs binary is not installed. Run `bun install` first: the platform package is an optional dependency.",
    );
  }

  const directory = join(root, TSDK_DIR);
  mkdirSync(directory, { recursive: true });

  const target = join(directory, "tsgo");
  rmSync(target, { force: true });

  try {
    symlinkSync(binary, target);
  } catch {
    copyFileSync(binary, target);
  }

  return target;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const target = prepare(root);
  console.log(`The TypeScript language server is ${target}.`);
  console.log(
    'Reload the window, or run "TypeScript: Restart Server", for the editor to pick it up.',
  );
}
