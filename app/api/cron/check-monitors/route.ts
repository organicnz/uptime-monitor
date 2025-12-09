import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/service";
import { processMonitorCheck } from "@/lib/monitor-checker";
import { secureCompare } from "@/lib/security";

// Config
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

// Local type matching what processMonitorCheck expects
type MonitorRow = {
  id: string;
  user_id: string;
  name: string;
  type: "http" | "tcp" | "ping" | "keyword" | "dns" | "docker" | "steam";
  url: string | null;
  hostname: string | null;
  port: number | null;
  method: string | null;
  keyword: string | null;
  headers: Record<string, string> | null;
  body: string | null;
  interval: number;
  retry_interval: number;
  timeout: number;
  max_retries: number;
  ignore_tls: boolean;
  upside_down: boolean;
  active: boolean;
};

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
) {
  return NextResponse.json({
    ...result,
    requestId: meta.requestId,
    duration: `${Date.now() - meta.startTime}ms`,
    source: meta.source,
    timestamp: new Date().toISOString(),
  });
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

    console.log(`[${requestId}] Starting monitor checks via ${source}`);
    const result = await runMonitorChecks(startTime, requestId);

    return buildResponse(result, { requestId, startTime, source });
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
    console.log(`[${requestId}] Starting monitor checks via bearer`);
    const result = await runMonitorChecks(startTime, requestId);

    return buildResponse(result, { requestId, startTime, source: "bearer" });
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
  const monitorIds = (monitors as MonitorRow[]).map((m) => m.id);
  const { data: lastHeartbeats } = await supabase
    .from("heartbeats")
    .select("monitor_id, time")
    .in("monitor_id", monitorIds)
    .order("time", { ascending: false });

  // Build lookup map for last check times
  const lastCheckMap = new Map<string, Date>();
  for (const hb of (lastHeartbeats || []) as {
    monitor_id: string;
    time: string;
  }[]) {
    if (!lastCheckMap.has(hb.monitor_id)) {
      lastCheckMap.set(hb.monitor_id, new Date(hb.time));
    }
  }

  // Filter monitors that are due for a check, prioritize by longest wait
  const monitorsToCheck = (monitors as MonitorRow[])
    .map((monitor) => {
      const lastCheckTime = lastCheckMap.get(monitor.id);
      const secondsSinceLastCheck = lastCheckTime
        ? (now.getTime() - lastCheckTime.getTime()) / 1000
        : Infinity;
      return {
        monitor,
        secondsSinceLastCheck,
        isDue: !lastCheckTime || secondsSinceLastCheck >= monitor.interval,
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

  console.log(
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
    const batchResults = await Promise.allSettled(
      batch.map((monitor) => processMonitorCheck(monitor)),
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

  console.log(
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
