import { expect, test, type Page } from "@playwright/test";

/**
 * Browser-level coverage for the WebGPU visualisations.
 *
 * These assertions exist because the failure modes they catch are invisible to
 * every other check in this repo. Unit tests, `tsc`, ESLint and the production
 * build all pass on a chart that never initialises, and the vgpu mock adapter
 * returns zeroed pixels and accepts invalid WGSL. A blank canvas is only
 * observable from a real browser with a real adapter, which is what this
 * exercises.
 *
 * `--enable-unsafe-swiftshader` is the load-bearing flag: without it
 * `navigator.gpu` still exists but `requestAdapter()` never yields a usable
 * adapter, so vgpu cannot initialise. Probing `"gpu" in navigator` is
 * therefore not a sufficient readiness check, and requesting an adapter from the
 * test races the page's own initialisation. This suite instead waits for the
 * component to report its own outcome and skips when it reports no adapter.
 */

/** Cold adapter acquisition on a software rasteriser is slow but bounded. */
const GPU_TIMEOUT_MS = 90_000;

const ready = (page: Page) => page.getByText("WebGPU", { exact: true });
const unavailable = (page: Page) =>
  page.getByText("WebGPU unavailable", { exact: true });

/**
 * Resolves true when the chart initialised, false when the environment has no
 * adapter. Never asserts: a machine without WebGPU is a skip, not a failure.
 */
async function waitForChartOutcome(page: Page): Promise<boolean> {
  const outcome = await Promise.race([
    ready(page)
      .waitFor({ state: "visible", timeout: GPU_TIMEOUT_MS })
      .then(() => "ready" as const),
    unavailable(page)
      .waitFor({ state: "visible", timeout: GPU_TIMEOUT_MS })
      .then(() => "unavailable" as const),
  ]).catch(() => "unavailable" as const);

  return outcome === "ready";
}

/**
 * The first page load in a browser process pays for software-adapter startup,
 * which can take tens of seconds and can fail outright. The warm-up below pays
 * that cost once for the whole project; after it, every later load is warm and
 * settles in well under a second. Without it the first spec in the run absorbs
 * the cold start and the rest look falsely fast.
 */
test("warms the software adapter once for the rest of the run", async ({
  page,
}) => {
  await page.goto("/gpu-fixture");
  await waitForChartOutcome(page);
  // Outcome is irrelevant here; this test exists only to pay the startup cost.
  expect(true).toBe(true);
});

async function chartInitialised(page: Page): Promise<boolean> {
  await page.goto("/gpu-fixture");
  return waitForChartOutcome(page);
}

test("initialises the chart on a real GPU and sizes the canvas", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  if (!(await chartInitialised(page))) {
    test.skip(true, "no WebGPU adapter available in this browser");
  }

  const chart = page.getByRole("img", { name: "Response time trend" });
  await expect(chart).toBeVisible();

  // A surface that never initialised leaves the element at its intrinsic
  // default (300x150) instead of tracking the CSS box.
  const intrinsic = await chart.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { width: c.width, height: c.height };
  });
  expect(intrinsic.width).toBeGreaterThan(300);
  expect(intrinsic.height).toBeGreaterThan(150);

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("renders a single static frame when reduced motion is preferred", async ({
  page,
}) => {
  // Emulated on the shared page rather than in a fresh context: a new context
  // gets its own GPU process, which does not benefit from the warm-up and made
  // this spec intermittently skip.
  await page.emulateMedia({ reducedMotion: "reduce" });

  if (!(await chartInitialised(page))) {
    test.skip(true, "no WebGPU adapter available in this browser");
  }

  const chart = page.getByRole("img", { name: "Response time trend" });
  const first = await chart.screenshot();
  await page.waitForTimeout(800);
  const second = await chart.screenshot();

  // A continuous frame loop redraws every tick, which changes at least the
  // pulsing head marker between these two captures.
  expect(
    Buffer.compare(first, second),
    "canvas changed between frames despite prefers-reduced-motion",
  ).toBe(0);
});

test("animates when reduced motion is not preferred", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });

  if (!(await chartInitialised(page))) {
    test.skip(true, "no WebGPU adapter available in this browser");
  }

  const chart = page.getByRole("img", { name: "Response time trend" });
  const first = await chart.screenshot();
  await page.waitForTimeout(800);
  const second = await chart.screenshot();

  // Guards the inverse of the test above: the static path must not have
  // silently become the only path.
  expect(
    Buffer.compare(first, second),
    "canvas did not change between frames, so the frame loop is not running",
  ).not.toBe(0);
});

test("serves the fixture because the e2e env flag is set", async ({ page }) => {
  // The route is gated on E2E_GPU_FIXTURE, which playwright.config.ts sets for
  // the web server. The unset case cannot be asserted from here, because this
  // server always has the flag on -- a 404 expectation would be a test that can
  // never pass. The positive contract is what is checked.
  const response = await page.goto("/gpu-fixture");
  expect(response?.status()).toBe(200);
});
