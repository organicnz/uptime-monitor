import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = Number(process.env.E2E_PORT ?? 3101);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const serverCommand =
  process.env.E2E_SERVER_COMMAND ??
  (process.env.E2E_PRODUCTION === "1"
    ? `bunx next start -p ${port}`
    : `bunx next dev -p ${port}`);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
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
    reuseExistingServer: Boolean(process.env.E2E_BASE_URL),
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-anon-key",
      CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
      // Unlocks the self-contained WebGPU fixture route (app/gpu-fixture).
      // Left unset everywhere else, so the route 404s in a real deployment.
      E2E_GPU_FIXTURE: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /gpu\.e2e\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Split out from the default project because the WebGPU specs need a
      // software adapter, which is slow to acquire on first use and absent on
      // some machines. Keeping them here means the main suite keeps its short
      // timeout and its launch flags, instead of inheriting both.
      name: "chromium-gpu",
      testMatch: /gpu\.e2e\.ts$/,
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
