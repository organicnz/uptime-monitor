import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/service";
import { secureCompare } from "@/lib/security";
import { getCronSecret, getQstashConfig } from "@/lib/env";
import { HEARTBEAT_RAW_RETENTION_DAYS } from "@/lib/uptime-reports";

export const runtime = "nodejs";

// The uptime report reads raw rows for exactly the last
// HEARTBEAT_RAW_RETENTION_DAYS days and heartbeat_daily for full days before
// that, so those two have to describe the same boundary.
const DEFAULT_RETENTION_DAYS = HEARTBEAT_RAW_RETENTION_DAYS;
const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_MAX_BATCHES = 20;

function getQstashReceiver(): Receiver {
  const { currentSigningKey, nextSigningKey } = getQstashConfig();
  return new Receiver({ currentSigningKey, nextSigningKey });
}

async function verifyQStashSignature(request: NextRequest): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  try {
    const receiver = getQstashReceiver();
    const body = await request.text();
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}

function verifyBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const expectedToken = getCronSecret();
  if (!expectedToken || !authHeader?.startsWith("Bearer ")) return false;
  return secureCompare(authHeader.slice(7), expectedToken);
}

/**
 * Rejecting a mismatched retention is deliberate. Rollups are only written for
 * days older than the retention cutoff, while the report only reads raw rows
 * for the last HEARTBEAT_RAW_RETENTION_DAYS days. Any other cutoff opens a
 * silent hole in between — days that have neither raw rows nor a rollup, and so
 * vanish from 30d/90d uptime without anything looking broken. Raising retention
 * means raising HEARTBEAT_RAW_RETENTION_DAYS to match, not passing a parameter.
 */
class RetentionMismatchError extends Error {
  constructor(requested: number) {
    super(
      `retentionDays must be ${HEARTBEAT_RAW_RETENTION_DAYS} to match the uptime report's raw window; got ${requested}`,
    );
    this.name = "RetentionMismatchError";
  }
}

function parseParams(url: URL) {
  const retentionDays = Math.max(
    1,
    Number(url.searchParams.get("retentionDays")) || DEFAULT_RETENTION_DAYS,
  );
  if (retentionDays !== HEARTBEAT_RAW_RETENTION_DAYS) {
    throw new RetentionMismatchError(retentionDays);
  }
  const batchSize = Math.min(
    5000,
    Math.max(
      100,
      Number(url.searchParams.get("batchSize")) || DEFAULT_BATCH_SIZE,
    ),
  );
  const maxBatches = Math.min(
    100,
    Math.max(
      1,
      Number(url.searchParams.get("maxBatches")) || DEFAULT_MAX_BATCHES,
    ),
  );
  return { retentionDays, batchSize, maxBatches };
}

/**
 * Daily heartbeat retention: rolls full UTC days older than the cutoff
 * into heartbeat_daily, then deletes raw rows in bounded batches.
 * Same auth as check-monitors (QStash signature or CRON_SECRET bearer).
 * Schedule daily via QStash/GitHub Actions, not every minute.
 */
async function runCleanup(params: {
  retentionDays: number;
  batchSize: number;
  maxBatches: number;
}) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc(
    "retention_rollup_and_cleanup" as never,
    {
      p_retention_days: params.retentionDays,
      p_batch_size: params.batchSize,
      p_max_batches: params.maxBatches,
    } as never,
  );
  if (error) throw new Error(`Retention cleanup failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as {
    rolled_up_days?: number;
    deleted_rows?: number;
  } | null;
  return {
    rolledUpDays: row?.rolled_up_days ?? 0,
    deletedRows: Number(row?.deleted_rows ?? 0),
    ...params,
  };
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : "Internal server error",
    },
    { status: error instanceof RetentionMismatchError ? 400 : 500 },
  );
}

export async function POST(request: NextRequest) {
  const hasQstash = request.headers.has("upstash-signature");
  const authorized = hasQstash
    ? await verifyQStashSignature(request)
    : verifyBearerToken(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const params = parseParams(new URL(request.url));
    const result = await runCleanup(params);
    return NextResponse.json({
      message: "Heartbeat retention completed",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cleanup] failed:", error);
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "true") {
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  }
  if (!verifyBearerToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runCleanup(parseParams(url));
    return NextResponse.json({
      message: "Heartbeat retention completed",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cleanup] failed:", error);
    return errorResponse(error);
  }
}
