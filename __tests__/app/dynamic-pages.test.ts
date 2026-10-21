import { readFileSync } from "bun:fs";
import { join, relative } from "bun:path";
import { describe, expect, it } from "bun:test";

/**
 * A page that gates on the environment has to be rendered per request.
 *
 * Next.js prerenders a page that reads nothing dynamic, and a prerender
 * evaluates the page's own code — at *build* time. A page that decides
 * whether to render from an environment variable is therefore decided
 * before the environment is set, and the answer is baked into the HTML.
 *
 * That is not hypothetical: the WebGPU fixture route gated itself on
 * `E2E_GPU_FIXTURE`, which the e2e server only sets when it starts, and
 * the built page had the "not found" response baked into it. The route
 * could never be turned on, and the spec that checks it could never pass.
 *
 * Route handlers are not affected: a handler is always per request.
 */

const ROOT = join(import.meta.dir, "..", "..");
const APP_DIR = join(ROOT, "app");

/** Every page under `app/`, as a path relative to the repository root. */
const PAGE_GLOB = new Bun.Glob("**/page.{ts,tsx}");

function pages(): string[] {
  return [...PAGE_GLOB.scanSync({ cwd: APP_DIR })].map((page) =>
    relative(ROOT, join(APP_DIR, page)),
  );
}

/** A runtime environment read — one that is not inlined at build time. */
const RUNTIME_ENV_READ = /\b(Bun|process)\.env\.(?!NEXT_PUBLIC)/;

describe("pages that read the environment are rendered per request", () => {
  const all = pages();

  it("finds the pages it is meant to check", () => {
    expect(all.length).toBeGreaterThan(5);
  });

  it("declares itself dynamic when it reads the environment", () => {
    const offenders: string[] = [];

    for (const page of all) {
      const source = readFileSync(join(ROOT, page), "utf-8");
      if (!RUNTIME_ENV_READ.test(source)) continue;
      // `force-dynamic` is the explicit form. Anything that opts out of
      // prerendering is equally correct, but `dynamic` with a value is the
      // one that says "per request" without a second thing to check.
      if (!/export const dynamic\s*=\s*"force-dynamic"/.test(source)) {
        offenders.push(page);
      }
    }

    expect(offenders).toEqual([]);
  });
});
