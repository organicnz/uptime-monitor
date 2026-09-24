import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/service";
import { processMonitorCheck } from "@/lib/monitor-checker";
import { getCheckInterval } from "@/lib/monitor-status";
import { secureCompare } from "@/lib/security";
import type { Monitor } from "@/types/application";

export const runtime = "nodejs";

const CONCURRENCY_LIMIT = 10;
const MAX_EXECUTION_TIME_MS = 55_000; // Leave buffer before Vercel's 60s timeout

// Response types
type CheckResult = {
  message: string;
  total: number;
  checked: number;
  successful: number;
  failed: number;
  skipped?: number;
  timedOut?: boolean;
  failures?: FailureDetail[];
};

type FailureDetail = {
  monitorId: string;
  monitorName: string;
  error: string;
};

type AuthSource = "qstash" | "bearer" | "none";

// Generate unique request ID for tracing
function generateRequestId(): string {
  return `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Execution deadline exceeded")),
      Math.max(1, timeoutMs),
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Canonical Monitor row type is imported from types/application.
// Do not redefine locally so schema changes propagate.

// QStash receiver for signature verification
const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
});

// Verify QStash signature
async function verifyQStashSignature(request: NextRequest): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;

  try {
    const body = await request.text();
    return await qstashReceiver.verify({ signature, body });
  } catch {
    return false;
  }
}

// Verify Bearer token (for GitHub Actions / manual triggers)
// Uses constant-time comparison to prevent timing attacks
function verifyBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!authHeader || !expectedToken) return false;
  if (!authHeader.startsWith("Bearer ")) return false;

  const receivedToken = authHeader.slice(7); // Remove "Bearer " prefix
  return secureCompare(receivedToken, expectedToken);
}

// Authenticate request and return source
async function authenticateRequest(request: NextRequest): Promise<AuthSource> {
  if (request.headers.has("upstash-signature")) {
    return (await verifyQStashSignature(request)) ? "qstash" : "none";
  }
  return verifyBearerToken(request) ? "bearer" : "none";
}

// Build JSON response with common fields
function buildResponse(
  result: CheckResult,
  meta: { requestId: string; startTime: number; source: AuthSource },
  status = 200,
) {
  return NextResponse.json(
    {
      ...result,
      requestId: meta.requestId,
      duration: `${Date.now() - meta.startTime}ms`,
      source: meta.source,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}

// POST handler - called by QStash
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const source = await authenticateRequest(request);
    if (source === "none") {
      console.warn(`[${requestId}] Unauthorized POST request`);
      return NextResponse.json(
        { error: "Unauthorized", requestId },
        { status: 401 },
      );
    }

    console.info(`[${requestId}] Starting monitor checks via ${source}`);
    const result = await runMonitorChecks(startTime, requestId);

    const status = result.timedOut || result.failed > 0 ? 503 : 200;
    return buildResponse(result, { requestId, startTime, source }, status);
  } catch (error) {
    console.error(`[${requestId}] Cron job error:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        requestId,
      },
      { status: 500 },
    );
  }
}

// GET handler - for GitHub Actions / manual triggers / health checks
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();
  const url = new URL(request.url);

  // Health check endpoint (no auth required)
  if (url.searchParams.get("health") === "true") {
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  if (!verifyBearerToken(request)) {
    console.warn(`[${requestId}] Unauthorized GET request`);
    return NextResponse.json(
      { error: "Unauthorized", requestId },
      { status: 401 },
    );
  }

  try {
    console.info(`[${requestId}] Starting monitor checks via bearer`);
    const result = await runMonitorChecks(startTime, requestId);

    const status = result.timedOut || result.failed > 0 ? 503 : 200;
    return buildResponse(
      result,
      { requestId, startTime, source: "bearer" },
      status,
    );
  } catch (error) {
    console.error(`[${requestId}] Cron job error:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        requestId,
      },
      { status: 500 },
    );
  }
}

// Core monitor check logic
async function runMonitorChecks(
  startTime: number,
  requestId: string,
): Promise<CheckResult> {
  const supabase = createServiceClient();
  const now = new Date();

  // Fetch all active monitors
  const { data: monitors, error } = await supabase
    .from("monitors")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error(`[${requestId}] Error fetching monitors:`, error);
    throw new Error("Failed to fetch monitors");
  }

  if (!monitors || monitors.length === 0) {
    return {
      message: "No active monitors",
      total: 0,
      checked: 0,
      successful: 0,
      failed: 0,
    };
  }

  // Get last heartbeat times in a single query
  const monitorIds = (monitors as Monitor[]).map((m) => m.id);
  const { data: lastHeartbeats, error: heartbeatError } = await supabase
    .from("heartbeats")
    .select("monitor_id, time, status, down_count")
    .in("monitor_id", monitorIds)
    .order("time", { ascending: false });

  if (heartbeatError) {
    throw new Error("Failed to fetch last heartbeat times");
  }

  const lastHeartbeatMap = new Map<
    string,
    { time: Date; status: number; downCount: number }
  >();
  for (const hb of (lastHeartbeats || []) as {
    monitor_id: string;
    time: string;
    status: number;
    down_count: number | null;
  }[]) {
    if (!lastHeartbeatMap.has(hb.monitor_id)) {
      lastHeartbeatMap.set(hb.monitor_id, {
        time: new Date(hb.time),
        status: hb.status,
        downCount: hb.down_count ?? 0,
      });
    }
  }

  // Filter monitors that are due for a check, prioritize by longest wait
  const monitorsToCheck = (monitors as Monitor[])
    .map((monitor) => {
      const lastHeartbeat = lastHeartbeatMap.get(monitor.id);
      const secondsSinceLastCheck = lastHeartbeat
        ? (now.getTime() - lastHeartbeat.time.getTime()) / 1000
        : Infinity;
      const checkInterval = getCheckInterval(
        monitor.interval,
        monitor.retry_interval,
        lastHeartbeat?.status ?? null,
        lastHeartbeat?.downCount ?? 0,
      );
      return {
        monitor,
        secondsSinceLastCheck,
        isDue: !lastHeartbeat || secondsSinceLastCheck >= checkInterval,
      };
    })
    .filter((m) => m.isDue)
    .sort((a, b) => b.secondsSinceLastCheck - a.secondsSinceLastCheck) // Longest wait first
    .map((m) => m.monitor);

  if (monitorsToCheck.length === 0) {
    return {
      message: "No monitors due for check",
      total: monitors.length,
      checked: 0,
      successful: 0,
      failed: 0,
    };
  }

  console.info(
    `[${requestId}] Checking ${monitorsToCheck.length}/${monitors.length} monitors`,
  );

  // Process checks in batches with concurrency limit and timeout awareness
  const results: PromiseSettledResult<void>[] = [];
  const failures: FailureDetail[] = [];
  let skipped = 0;
  let timedOut = false;

  for (let i = 0; i < monitorsToCheck.length; i += CONCURRENCY_LIMIT) {
    // Check if we're approaching timeout
    if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
      skipped = monitorsToCheck.length - i;
      timedOut = true;
      console.warn(
        `[${requestId}] Approaching timeout, skipping ${skipped} remaining monitors`,
      );
      break;
    }

    const batch = monitorsToCheck.slice(i, i + CONCURRENCY_LIMIT);
    const remainingTime = MAX_EXECUTION_TIME_MS - (Date.now() - startTime);
    const deadlineAt = startTime + MAX_EXECUTION_TIME_MS;
    const batchResults = await Promise.allSettled(
      batch.map((monitor) =>
        withDeadline(processMonitorCheck(monitor, deadlineAt), remainingTime),
      ),
    );

    // Collect failure details
    batchResults.forEach((r, idx) => {
      if (r.status === "rejected") {
        const monitor = batch[idx];
        const errorMsg =
          r.reason instanceof Error ? r.reason.message : String(r.reason);
        failures.push({
          monitorId: monitor.id,
          monitorName: monitor.name,
          error: errorMsg,
        });
        console.error(
          `[${requestId}] Monitor "${monitor.name}" failed: ${errorMsg}`,
        );
      }
    });

    results.push(...batchResults);
  }

  const successful = results.filter((r) => r.status === "fulfilled").length;
  const failed = failures.length;

  console.info(
    `[${requestId}] Completed: ${successful} success, ${failed} failed, ${skipped} skipped`,
  );

  return {
    message: timedOut
      ? "Monitor checks partially completed (timeout)"
      : "Monitor checks completed",
    total: monitors.length,
    checked: results.length,
    successful,
    failed,
    ...(skipped > 0 && { skipped }),
    ...(timedOut && { timedOut }),
    ...(failures.length > 0 && { failures }),
  };
}
