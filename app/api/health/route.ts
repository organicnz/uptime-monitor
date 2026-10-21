import { NextResponse } from "next/server";

import { getQstashConfig } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

type DependencyStatus = {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
};

async function checkSupabase(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("monitors").select("id").limit(1);

    if (error) {
      return {
        name: "supabase",
        status: "unhealthy",
        latencyMs: Date.now() - start,
        message: error.message,
      };
    }

    return {
      name: "supabase",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "supabase",
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * The QStash check.
 *
 * It reads a configuration value and never waits for anything, so it is
 * not `async` — but it returns a promise anyway, so that the two checks
 * below are the same shape and `Promise.all` gets a list of promises
 * rather than a list of things and a promise.
 */
function checkQStash(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    getQstashConfig();
    return Promise.resolve({
      name: "qstash",
      status: "healthy",
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    return Promise.resolve({
      name: "qstash",
      status: "degraded",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Not configured",
    });
  }
}

export async function GET() {
  const startTime = Date.now();
  const dependencies = await Promise.all([checkSupabase(), checkQStash()]);

  const hasUnhealthy = dependencies.some((d) => d.status === "unhealthy");
  const hasDegraded = dependencies.some((d) => d.status === "degraded");

  const overallStatus: HealthStatus = hasUnhealthy
    ? "unhealthy"
    : hasDegraded
      ? "degraded"
      : "healthy";

  const statusCode = overallStatus === "unhealthy" ? 503 : 200;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      // `performance.now()` is measured from the process start, which is the
      // same window `process.uptime()` reported — without the Node.js API.
      uptime: performance.now() / 1000,
      latency: `${Date.now() - startTime}ms`,
      dependencies: dependencies.reduce(
        (acc, dep) => {
          acc[dep.name] = {
            status: dep.status,
            latencyMs: dep.latencyMs,
            ...(dep.message && { message: dep.message }),
          };
          return acc;
        },
        {} as Record<string, unknown>,
      ),
    },
    { status: statusCode },
  );
}
