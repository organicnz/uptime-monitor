import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getQstashConfig } from "@/lib/env";

export const runtime = "nodejs";

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

async function checkQStash(): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    getQstashConfig();
    return {
      name: "qstash",
      status: "healthy",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: "qstash",
      status: "degraded",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Not configured",
    };
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
      uptime: process.uptime(),
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
