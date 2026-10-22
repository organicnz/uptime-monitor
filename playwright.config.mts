import { defineConfig, devices } from "@playwright/test";

// The Playwright CLI runs on Bun (`bun --bun playwright test`), so `Bun.env`
// is the accessor for the environment that drives the suite.
const isCI = Boolean(Bun.env.CI);
const port = Number(Bun.env.E2E_PORT ?? 3101);

/**
 * The base URL the suite talks to.
 *
 * `||` and not `??`: an empty environment variable is how a shell usually
 * spells "unset", and `??` would keep it — leaving Playwright with no
 * base URL, where every relative request fails with "Invalid URL" and the
 * whole suite looks broken.
 */
export function resolveBaseURL(
  env: Record<string, string | undefined>,
  port: number,
): string {
  return env.E2E_BASE_URL || `http://localhost:${port}`;
}

/**
 * The command that starts the server the suite runs against.
 *
 * `||` for the same reason as the base URL: an empty `E2E_SERVER_COMMAND`
 * is "unset", not "run nothing".
 */
export function resolveServerCommand(
  env: Record<string, string | undefined>,
  port: number,
): string {
  return (
    env.E2E_SERVER_COMMAND ||
    (env.E2E_PRODUCTION === "1"
      ? `bun --bun next start -p ${port}`
      : `bun --bun next dev -p ${port}`)
  );
}

const baseURL = resolveBaseURL(Bun.env, port);
const serverCommand = resolveServerCommand(Bun.env, port);

export default defineConfig({
  testDir: "./e2e",
  // `.mts` on purpose: Playwright's TypeScript transform for CommonJS files
  // hooks `require.extensions`, which Bun does not implement. The ESM loader
  // path works on Bun, so the specs are ESM modules.
  testMatch: "**/*.e2e.mts",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: serverCommand,
    // Poll the landing page rather than the cron health endpoint: the health
    // route is auth/CAS-guarded, so probing it can report "not ready" even when
    // the server is serving traffic fine.
    url: baseURL,
    // Always boot a dedicated server unless one is explicitly pinned via
    // E2E_BASE_URL (e.g. against a deployed preview). Relying on an ambient
    // dev server made local runs non-deterministic and silently reuse stale
    // builds.
    reuseExistingServer: Boolean(Bun.env.E2E_BASE_URL),
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        Bun.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        Bun.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-anon-key",
      CRON_SECRET: Bun.env.CRON_SECRET ?? "e2e-cron-secret",
      // The suite runs against a local server, which is not Vercel — and
      // the app asks the platform for the analytics script only when it
      // is on Vercel, because the script is served by the platform. A
      // local `.env.local` pulled from a Vercel project says `VERCEL=1`,
      // and without this the suite would ask a local server for a script
      // that only Vercel serves, and get a 404 the browser logs.
      VERCEL: "",
      // Unlocks the self-contained WebGPU fixture route (app/gpu-fixture).
      // Left unset everywhere else, so the route 404s in a real deployment.
      E2E_GPU_FIXTURE: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /gpu\.e2e\.mts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Split out from the default project because the WebGPU specs need a
      // software adapter, which is slow to acquire on first use and absent on
      // some machines. Keeping them here means the main suite keeps its short
      // timeout and its launch flags, instead of inheriting both.
      name: "chromium-gpu",
      testMatch: /gpu\.e2e\.mts$/,
      timeout: 180_000,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan,WebGPU",
            "--use-angle=swiftshader",
            // Load-bearing: without it `navigator.gpu` exists but
            // `requestAdapter()` yields nothing usable, so vgpu never starts.
            "--enable-unsafe-swiftshader",
          ],
        },
      },
    },
  ],
});
