import { createServiceClient } from "@/lib/supabase/service";
import { HEARTBEAT_STATUS } from "@/lib/monitor-status";
import type { Monitor } from "@/types/application";

export type RollingStats = {
  avg_response_time_ms: number;
  success_rate_percent: number;
  sample_count: number;
};

export type RollingWindow = {
  hours: number;
  minSamples: number;
};

export type HeartbeatSample = {
  status: number;
  ping: number | null;
  duration: number | null;
};

const MAX_ROWS = 500;

const DEFAULT_WINDOW: RollingWindow = { hours: 24, minSamples: 5 };

/**
 * Window sized so it holds ~100 checks, floored at 15 minutes and capped at a
 * week. Wide enough that the average is not dominated by one slow check,
 * narrow enough to react to a genuine regression.
 */
export function getStatsWindowForMonitor(
  monitor: Pick<Monitor, "interval">,
): RollingWindow {
  const intervalSeconds = Math.max(10, monitor.interval);
  const hours = Math.min(168, Math.max(0.25, (intervalSeconds * 100) / 3600));
  return { hours, minSamples: 3 };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Summarise a window of heartbeats.
 *
 * MAINTENANCE is removed from the sample entirely rather than counted as a
 * failure: a planned window is an intentional suspension, and folding it into
 * the denominator would report scheduled work as downtime. PENDING is kept and
 * counted against the rate, because it means the check actually failed and is
 * still inside the retry window. DEGRADED counts as success — the check
 * returned a response, it was merely slow — so a latency regression does not
 * masquerade as an availability incident.
 *
 * Returns null when there is too little data to say anything meaningful.
 */
export function summarizeHeartbeats(
  samples: HeartbeatSample[],
  window: RollingWindow = DEFAULT_WINDOW,
): RollingStats | null {
  const measured = samples.filter(
    (s) => s.status !== HEARTBEAT_STATUS.MAINTENANCE,
  );
  if (measured.length < window.minSamples) return null;

  const latencies = measured
    .map((s) => s.ping ?? s.duration)
    .filter((v): v is number => v !== null && v > 0);

  const avgResponseTimeMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length)
      : 0;

  const healthy = measured.filter(
    (s) =>
      s.status === HEARTBEAT_STATUS.UP ||
      s.status === HEARTBEAT_STATUS.DEGRADED,
  ).length;

  return {
    avg_response_time_ms: avgResponseTimeMs,
    success_rate_percent: round2((healthy / measured.length) * 100),
    sample_count: measured.length,
  };
}

/**
 * Best-effort refresh throttle.
 *
 * Rewriting the aggregate on every check would re-read up to 500 rows per
 * monitor per interval, which does not scale on a small database plan. This is
 * a cache, not a source of truth: losing it (cold instance) only costs one
 * extra recompute, and the write is idempotent, so a redundant refresh is
 * harmless.
 */
const lastRefresh = new Map<string, number>();

function minRefreshGapMs(intervalSeconds: number): number {
  return Math.max(5 * 60_000, intervalSeconds * 1000 * 15);
}

export function claimAnalyticsRefresh(
  monitor: Pick<Monitor, "id" | "interval">,
  now: number = Date.now(),
): boolean {
  const previous = lastRefresh.get(monitor.id);
  if (
    previous !== undefined &&
    now - previous < minRefreshGapMs(monitor.interval)
  ) {
    return false;
  }
  markRefreshed(monitor.id, now);
  return true;
}

function markRefreshed(monitorId: string, now: number): void {
  lastRefresh.set(monitorId, now);
  if (lastRefresh.size > 1000) lastRefresh.clear();
}

export function resetAnalyticsThrottle(): void {
  lastRefresh.clear();
}

export async function computeRollingStats(
  monitorId: string,
  window: RollingWindow = DEFAULT_WINDOW,
): Promise<RollingStats | null> {
  const supabase = createServiceClient();
  const since = new Date(
    Date.now() - window.hours * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("heartbeats")
    .select("status, ping, duration")
    .eq("monitor_id", monitorId)
    .gte("time", since)
    .order("time", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error(
      `[analytics] Failed to read heartbeats for ${monitorId}: ${error.message}`,
    );
    return null;
  }

  return summarizeHeartbeats((data ?? []) as HeartbeatSample[], window);
}

export async function updateMonitorAnalytics(
  monitor: Pick<Monitor, "id" | "interval">,
): Promise<void> {
  if (!claimAnalyticsRefresh(monitor)) return;

  const window = getStatsWindowForMonitor(monitor);
  const stats = await computeRollingStats(monitor.id, window);
  if (!stats) return;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("monitors")
    .update({
      avg_response_time_ms: stats.avg_response_time_ms,
      success_rate_percent: stats.success_rate_percent,
    })
    .eq("id", monitor.id);

  if (error) {
    console.error(
      `[analytics] Failed to update stats for ${monitor.id}: ${error.message}`,
    );
  }
}
