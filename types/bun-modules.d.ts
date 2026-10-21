/**
 * Ambient declarations for Bun's first-party module namespaces.
 *
 * `bun-types` declares the `Bun.*` globals but not the `bun:*` module
 * specifiers, so this file declares exactly the surface the codebase uses.
 *
 * These declarations are written against Bun's own API, not borrowed from
 * `@types/node`. That is the point: the project has no Node.js runtime, and
 * a `node:fs` re-export would drag the Node.js type surface back in through
 * the back door. Bun's `bun:fs` is a first-class module with its own
 * semantics, and it is declared here as such.
 *
 * Only the functions the repository actually calls are declared. Adding a
 * call site means adding a signature here — a deliberate, reviewable step
 * rather than an accidental widening of the Node.js compatibility surface.
 */

/** A filesystem entry, as returned by {@link stat}. */
declare module "bun:fs" {
  export interface Stats {
    /** File size in bytes. */
    size: number;
    /** True when the entry is a regular file. */
    isFile(): boolean;
    /** True when the entry is a directory. */
    isDirectory(): boolean;
  }

  /** True when a file or directory exists at `path`. */
  export function existsSync(path: string | URL): boolean;

  /**
   * Read a file. Pass an encoding to receive a string; omit it to receive the
   * raw bytes.
   */
  export function readFileSync(
    path: string | URL,
    encoding: "utf-8" | "utf8",
  ): string;
  export function readFileSync(path: string | URL): Uint8Array;

  /** Names of the entries in a directory. */
  export function readdirSync(path: string | URL): string[];

  /** Write `data` to `path`, creating or truncating it. */
  export function writeFileSync(
    path: string | URL,
    data: string | Uint8Array,
  ): void;

  /**
   * Resolve `path` to its canonical form, following every symbolic link.
   * Used to prove that a `node` on $PATH is Bun's alias rather than a real
   * Node.js installation.
   */
  export function realpathSync(path: string | URL): string;

  /**
   * Create a unique temporary directory whose name starts with `prefix`.
   * `prefix` is normally `join(tmpdir(), "some-prefix-")`.
   */
  export function mkdtempSync(prefix: string): string;
}

declare module "bun:fs/promises" {
  import type { Stats } from "bun:fs";

  /** Read a file. Pass an encoding to receive a string. */
  export function readFile(
    path: string | URL,
    encoding: "utf-8" | "utf8",
  ): Promise<string>;

  /** Metadata for a filesystem entry. */
  export function stat(path: string | URL): Promise<Stats>;
}

declare module "bun:path" {
  /** Join path segments with the platform separator. */
  export function join(...paths: string[]): string;

  /** Path of `to` relative to `from`. */
  export function relative(from: string, to: string): string;

  /** Final path segment, optionally without a trailing extension. */
  export function basename(path: string, ext?: string): string;
}

declare module "bun:os" {
  /** The system's default temporary directory. */
  export function tmpdir(): string;
}
