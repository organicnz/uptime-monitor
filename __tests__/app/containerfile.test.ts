import { existsSync, readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

/**
 * The Containerfile.
 *
 * The image is what the app is actually deployed from, and a `COPY` of a
 * path that no longer exists fails the *build*, not the app — so the
 * breakage shows up as a failed deploy rather than as a failed check.
 *
 * The paths the image copies out of the build stage have to exist in the
 * repository, and the ones the build produces have to be produced by it.
 */

const ROOT = join(import.meta.dir, "..", "..");
const CONTAINERFILE = join(ROOT, "Containerfile");

/** What the build stage produces, rather than copies from the repository. */
const BUILD_OUTPUTS = new Set([".next", "node_modules"]);

/** `COPY --from=build /app/<path> <dest>`, in any flag order. */
function copiedFromBuildStage(): string[] {
  const source = readFileSync(CONTAINERFILE, "utf-8");
  const paths: string[] = [];

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("COPY ")) continue;
    if (!trimmed.includes("--from=build")) continue;
    const match = /\/app\/(\S+)/.exec(trimmed);
    if (match?.[1]) paths.push(match[1]);
  }

  return paths;
}

describe("the Containerfile", () => {
  it("is found", () => {
    expect(existsSync(CONTAINERFILE)).toBe(true);
  });

  it("copies only paths that exist", () => {
    const missing: string[] = [];

    for (const path of copiedFromBuildStage()) {
      if (BUILD_OUTPUTS.has(path)) continue;
      if (!existsSync(join(ROOT, path))) missing.push(path);
    }

    expect(missing).toEqual([]);
  });

  it("copies the build output it needs to serve", () => {
    const copied = copiedFromBuildStage();

    // The server cannot start without the build, and it cannot serve
    // without the static assets.
    expect(copied).toContain(".next");
    expect(copied).toContain("public");
    // The config is read when the server boots.
    expect(copied).toContain("next.config.ts");
    // `package.json` is what tells Bun this is a Node-style app to run.
    expect(copied).toContain("package.json");
  });

  it("runs the server on Bun", () => {
    const source = readFileSync(CONTAINERFILE, "utf-8");

    // The image has no Node.js in it, so the command has to be the one
    // that does not need it.
    expect(source).toMatch(/CMD \["bun", "run", "start"\]/);
    expect(source).not.toMatch(/^FROM node:/m);
  });
});
