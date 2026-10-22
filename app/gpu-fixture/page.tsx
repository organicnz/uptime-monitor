import { notFound } from "next/navigation";
import { connection } from "next/server";

import { GPUResponseChart } from "@/components/gpu-response-chart-client";
import { GPUStatusBackground } from "@/components/gpu-status-background-client";

/**
 * Self-contained fixture for the WebGPU e2e spec.
 *
 * The e2e server runs against placeholder Supabase credentials, so nothing
 * here can read a monitor; the chart is driven by synthetic samples instead.
 *
 * Gated on an env var that only the Playwright web server sets, so this route
 * 404s in a real deployment rather than shipping a demo page to production.
 *
 * The page stops the prerender at `connection()`. It reads the environment
 * and nothing else, which is exactly what makes Next.js prerender it — and a
 * prerender evaluates the gate at *build* time, before the Playwright server
 * has set the flag. The result was a 404 baked into the HTML, so the flag
 * could never turn the route on. Reading the environment at request time is
 * the whole point of the gate.
 *
 * `instant = false` says the route is allowed to block on the server, which
 * is what a page that reads the environment at request time has to be. The
 * alternative — a Suspense boundary around the gate — would leave a hole in
 * the prerendered shell, and the shell of a fixture that 404s in production
 * is not worth having.
 */
export const instant = false;
function enabled(): boolean {
  return Bun.env.E2E_GPU_FIXTURE === "1";
}

function buildSamples() {
  return Array.from({ length: 120 }, (_, i) => ({
    ping: 80 + Math.round(60 * Math.sin(i / 7)) + (i % 23 === 0 ? 900 : 0),
    status: i % 23 === 0 ? 4 : 1,
  }));
}

export default async function GpuFixturePage() {
  // Prerendering stops here: everything below runs at request time, so the
  // gate sees the environment the server actually has.
  await connection();

  if (!enabled()) notFound();

  return (
    <div className="relative min-h-screen">
      <GPUStatusBackground status="degraded" />
      <div className="relative z-10 p-8">
        <h1 className="mb-6 text-2xl font-bold">GPU fixture</h1>
        <div className="max-w-3xl">
          <GPUResponseChart points={buildSamples()} height={260} />
        </div>
      </div>
    </div>
  );
}
