import { existsSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import type { PlaywrightTestConfig } from "@playwright/test";

import config, {
  resolveBaseURL,
  resolveServerCommand,
} from "../../playwright.config.mts";

/**
 * The command the config starts its server with.
 *
 * Playwright's own type allows more than one web server, so the command
 * can be on an object or on the first entry of a list. This configuration
 * declares one.
 */
function serverCommandOf(config: PlaywrightTestConfig): string | undefined {
  const server = config.webServer;
  if (!server) return undefined;

  return Array.isArray(server) ? server[0]?.command : server.command;
}

describe("the e2e configuration", () => {
  it("is an ES module, because a CommonJS one is parsed as JavaScript", () => {
    // Playwright loads a `.ts` config through `require`, and it hooks
    // `require.extensions` so that `.ts` is handled by the `.js` loader.
    // Bun has no such hook, so the aliasing is what Bun's own `require`
    // sees — and Bun then reads the file as JavaScript. A type annotation
    // in a `.ts` config is a parse error there, and the whole suite fails
    // to start with a message that points at the annotation rather than at
    // the loader.
    //
    // `.mts` takes the ESM path, which Bun loads as TypeScript.
    const root = join(import.meta.dir, "..", "..");

    expect(existsSync(join(root, "playwright.config.mts"))).toBe(true);
    // Playwright looks for `.ts` before `.mts`, so a `.ts` config left
    // behind would win over the one that works.
    expect(existsSync(join(root, "playwright.config.ts"))).toBe(false);
  });

  it("falls back to the local server when the base URL is unset", () => {
    expect(resolveBaseURL({}, 3101)).toBe("http://localhost:3101");
  });

  it("treats an empty base URL as unset rather than as a URL", () => {
    // An empty environment variable is how a shell usually spells
    // "unset". Keeping it — which is what `??` does, because an empty
    // string is not nullish — leaves Playwright with no base URL, where
    // every relative request fails with "Invalid URL" and the whole suite
    // looks broken.
    expect(resolveBaseURL({ E2E_BASE_URL: "" }, 3101)).toBe(
      "http://localhost:3101",
    );
  });

  it("uses the base URL it was given", () => {
    expect(
      resolveBaseURL({ E2E_BASE_URL: "http://127.0.0.1:4321" }, 3101),
    ).toBe("http://127.0.0.1:4321");
  });

  it("starts the production server when the suite asks for one", () => {
    expect(resolveServerCommand({ E2E_PRODUCTION: "1" }, 3101)).toContain(
      "next start",
    );
  });

  it("starts the development server otherwise", () => {
    expect(resolveServerCommand({}, 3101)).toContain("next dev");
  });

  it("treats an empty server command as unset", () => {
    expect(
      resolveServerCommand(
        { E2E_SERVER_COMMAND: "", E2E_PRODUCTION: "1" },
        3101,
      ),
    ).toContain("next start");
  });

  it("uses the command it was given", () => {
    expect(
      resolveServerCommand({ E2E_SERVER_COMMAND: "bun run dev" }, 3101),
    ).toBe("bun run dev");
  });

  it("resolves the base URL the same way the config does", () => {
    // The helpers are the logic; the config has to go through them, or a
    // future edit could put the old `??` back in the config and leave
    // these tests passing.
    const port = Number(Bun.env.E2E_PORT ?? 3101);

    expect(config.use?.baseURL).toBe(resolveBaseURL(Bun.env, port));
    expect(serverCommandOf(config)).toBe(resolveServerCommand(Bun.env, port));
  });
});
