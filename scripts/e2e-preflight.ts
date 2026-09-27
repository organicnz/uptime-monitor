/**
 * Preflight guard for the end-to-end suite.
 *
 * Playwright fails deep inside a test run when its browser binaries are
 * missing, which is easy to misread as a product failure. This performs the
 * same launch the suite depends on and, on failure, prints the exact command
 * to fix it.
 *
 * The launch is deliberately the source of truth rather than a path check:
 * `chromium.executablePath()` reports the full browser, while headless runs
 * actually use `chrome-headless-shell`, so a path check can pass while the
 * suite still cannot start.
 */
import { chromium } from "@playwright/test";

const HINT = [
  "",
  "❌ Playwright browser binary is missing or unusable.",
  "",
  "   The e2e suite needs a browser. Install it with:",
  "",
  "     bun run e2e:install      (local)",
  "     bun run e2e:install:ci   (CI, also installs OS dependencies)",
  "",
].join("\n");

async function main() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n")[0] : "";
    console.error(`${HINT}   Underlying error: ${detail}\n`);
    process.exit(1);
  }

  await browser.close();
}

await main();
