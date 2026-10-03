import { HEARTBEAT_STATUS } from "@/lib/monitor-status";
import type { createClient } from "@/lib/supabase/server";

export type SupabaseQueryClient = Awaited<ReturnType<typeof createClient>>;

export type ReportPeriod = "24h" | "7d" | "30d" | "90d";

export const REPORT_PERIODS: readonly ReportPeriod[] = [
  "24h",
  "7d",
  "30d",
  "90d",
];

const PERIOD_HOURS: Record<ReportPeriod, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

export type ReportIncident = {
  id: string;
  title: string;
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number;
};

export type UptimeReport = {
  monitorId: string;
  monitorName: string;
  period: ReportPeriod;
  since: string;
  totalChecks: number;
  upChecks: number;
  downChecks: number;
  degradedChecks: number;
  unknownChecks: number;
  uptimePercent: number;
  /** Share of retrieved checks that produced a verdict. */
  coveredPercent: number;
  /**
   * Earliest and latest data actually included. A gap after `since` is how a
   * report admits it is truncated: the retention job never ran, or the raw
   * table was pruned without rollups, so the older part of the window has
   * neither rows nor summaries. Null when there is no data at all.
   */
  dataFrom: string | null;
  dataTo: string | null;
  /**
   * Share of the requested window backed by data. Unlike coveredPercent this
   * is anchored to the window, not to the rows retrieved: a 90d report
   * computed from 7 days of raw data scores around 8 here and says so,
   * instead of reading 100% covered next to a misleading "since".
   */
  windowCoveragePercent: number;
  avgResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  totalDowntimeSeconds: number;
  incidents: ReportIncident[];
  generatedAt: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Raw heartbeats are retained for this many days (see the cleanup cron and
 * retention_rollup_and_cleanup). Older days live in heartbeat_daily, so
 * 30/90d reports merge both sources. Keep in sync with the cleanup default.
 */
export const HEARTBEAT_RAW_RETENTION_DAYS = 7;

type DailySummary = {
  day: string;
  total_checks: number;
  up_checks: number;
  down_checks: number;
  degraded_checks: number;
  pending_checks: number;
  maintenance_checks: number;
  avg_ping: number | null;
  min_ping: number | null;
  max_ping: number | null;
};

/**
 * Rolling uptime for one monitor over `period`.
 *
 * `uptimePercent` deliberately counts only conclusive UP checks. Note that
 * DEGRADED is conclusive but not "up", so it dilutes uptime - the opposite of
 * `lib/analytics.ts`, whose `success_rate_percent` counts a slow-but-answering
 * check as a success. Both are intentional: this figure is an availability
 * record, that one is a latency signal. MAINTENANCE and PENDING are excluded
 * rather than counted as failures, so a planned window does not read as
 * downtime. Because excluded checks are also not counted as up,
 * `coveredPercent` is reported alongside it: it is the share of the window that
 * actually produced a verdict, which is what tells you whether the uptime
 * figure is trustworthy.
 *
 * For 30/90d windows the raw table only covers the last
 * HEARTBEAT_RAW_RETENTION_DAYS days; older full days are merged in from
 * heartbeat_daily (written by the retention job before raw rows are
 * deleted, so the two sources never overlap).
 */
export async function generateUptimeReport(
  client: SupabaseQueryClient,
  monitorId: string,
  period: ReportPeriod,
): Promise<UptimeReport | null> {
  const since = new Date(
    Date.now() - PERIOD_HOURS[period] * 60 * 60 * 1000,
  ).toISOString();

  const monitorResult = await client
    .from("monitors")
    .select("id, name")
    .eq("id", monitorId)
    .maybeSingle();

  if (monitorResult.error || !monitorResult.data) return null;

  const monitor = monitorResult.data as { id: string; name: string };

  // Long windows span the retention boundary: raw rows cover the recent
  // slice, daily rollups cover full days before it. Short windows stay on
  // raw rows alone so behavior is unchanged.
  const useRollups = period === "30d" || period === "90d";
  const rawSince = useRollups
    ? new Date(
        Date.now() - HEARTBEAT_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString()
    : since;

  const heartbeatsResult = await client
    .from("heartbeats")
    .select("status, ping, duration, time")
    .eq("monitor_id", monitorId)
    .gte("time", rawSince)
    .order("time", { ascending: false })
    .limit(20000);

  if (heartbeatsResult.error) {
    throw new Error(
      `Failed to read heartbeats for ${monitorId}: ${heartbeatsResult.error.message}`,
    );
  }

  const heartbeats = (heartbeatsResult.data ?? []) as Array<{
    status: number;
    ping: number | null;
    duration: number | null;
    time: string;
  }>;

  // Rollup slice: full UTC days in [since, raw-cutoff). Filtered in JS
  // (not .lt(), which the RLS client path aside, keeps this working with
  // minimal query-builder surface) so days still covered by raw rows are
  // never double-counted.
  let summaries: DailySummary[] = [];
  if (useRollups) {
    const sinceDay = since.slice(0, 10);
    const cutoffDay = rawSince.slice(0, 10);
    try {
      const summariesResult = await client
        .from("heartbeat_daily")
        .select(
          "day, total_checks, up_checks, down_checks, degraded_checks, pending_checks, maintenance_checks, avg_ping, min_ping, max_ping",
        )
        .eq("monitor_id", monitorId)
        .gte("day", sinceDay)
        .order("day", { ascending: true })
        .limit(366);
      if (!summariesResult.error) {
        summaries = ((summariesResult.data ?? []) as DailySummary[]).filter(
          (s) => s.day >= sinceDay && s.day < cutoffDay,
        );
      }
    } catch {
      // heartbeat_daily may not exist yet (migration not applied): fall
      // back to raw-only rather than failing the report.
      summaries = [];
    }
  }

  const summaryTotals = summaries.reduce(
    (acc, s) => ({
      total: acc.total + s.total_checks,
      up: acc.up + s.up_checks,
      down: acc.down + s.down_checks,
      degraded: acc.degraded + s.degraded_checks,
      latencySum:
        acc.latencySum +
        (s.avg_ping && s.avg_ping > 0 ? s.avg_ping * s.total_checks : 0),
      latencyCount:
        acc.latencyCount + (s.avg_ping && s.avg_ping > 0 ? s.total_checks : 0),
      min:
        acc.min === null
          ? s.min_ping && s.min_ping > 0
            ? s.min_ping
            : null
          : s.min_ping && s.min_ping > 0
            ? Math.min(acc.min, s.min_ping)
            : acc.min,
      max:
        acc.max === null
          ? s.max_ping && s.max_ping > 0
            ? s.max_ping
            : null
          : s.max_ping && s.max_ping > 0
            ? Math.max(acc.max, s.max_ping)
            : acc.max,
    }),
    {
      total: 0,
      up: 0,
      down: 0,
      degraded: 0,
      latencySum: 0,
      latencyCount: 0,
      min: null as number | null,
      max: null as number | null,
    },
  );

  const rawUp = heartbeats.filter(
    (h) => h.status === HEARTBEAT_STATUS.UP,
  ).length;
  const rawDegraded = heartbeats.filter(
    (h) => h.status === HEARTBEAT_STATUS.DEGRADED,
  ).length;
  const rawDown = heartbeats.filter(
    (h) => h.status === HEARTBEAT_STATUS.DOWN,
  ).length;
  const totalChecks = heartbeats.length + summaryTotals.total;
  const upChecks = rawUp + summaryTotals.up;
  const degradedChecks = rawDegraded + summaryTotals.degraded;
  const downChecks = rawDown + summaryTotals.down;
  const unknownChecks = totalChecks - upChecks - degradedChecks - downChecks;

  const conclusive = upChecks + downChecks + degradedChecks;
  const latencies = heartbeats
    .map((h) => h.ping ?? h.duration)
    .filter((v): v is number => v !== null && v > 0);

  const summaryDays = summaries.map((s) => s.day).sort();
  const rawTimes = heartbeats
    .map((h) => new Date(h.time).getTime())
    .filter((ms) => Number.isFinite(ms));

  const dataFromMs =
    summaryDays.length > 0
      ? new Date(`${summaryDays[0]}T00:00:00.000Z`).getTime()
      : rawTimes.length > 0
        ? Math.min(...rawTimes)
        : null;
  const dataToMs =
    rawTimes.length > 0
      ? Math.max(...rawTimes)
      : summaryDays.length > 0
        ? new Date(
            `${summaryDays[summaryDays.length - 1]}T23:59:59.999Z`,
          ).getTime()
        : null;

  const nowMs = Date.now();
  const sinceMs = new Date(since).getTime();
  const dataFrom =
    dataFromMs === null ? null : new Date(dataFromMs).toISOString();
  const dataTo = dataToMs === null ? null : new Date(dataToMs).toISOString();
  const windowCoveragePercent =
    dataFromMs === null || dataToMs === null || nowMs <= sinceMs
      ? 0
      : round2(
          Math.min(
            100,
            Math.max(0, ((dataToMs - dataFromMs) / (nowMs - sinceMs)) * 100),
          ),
        );

  const uptimePercent =
    conclusive === 0 ? 100 : round2((upChecks / conclusive) * 100);
  const coveredPercent =
    totalChecks === 0 ? 0 : round2((conclusive / totalChecks) * 100);

  // Downtime is summed from the checks that actually failed rather than from
  // incident start/end, because an unresolved incident would otherwise report
  // an open-ended duration.
  const averageIntervalSeconds = totalChecks
    ? (PERIOD_HOURS[period] * 3600) / totalChecks
    : 0;
  const totalDowntimeSeconds = Math.round(downChecks * averageIntervalSeconds);

  const incidentsResult = await client
    .from("incidents")
    .select("id, title, started_at, resolved_at")
    .eq("monitor_id", monitorId)
    .gte("started_at", since)
    .limit(500);

  if (incidentsResult.error) {
    throw new Error(
      `Failed to read incidents for ${monitorId}: ${incidentsResult.error.message}`,
    );
  }

  const incidents: ReportIncident[] = (
    (incidentsResult.data ?? []) as Array<{
      id: string;
      title: string;
      started_at: string;
      resolved_at: string | null;
    }>
  ).map((incident) => {
    const startedMs = new Date(incident.started_at).getTime();
    const resolvedMs = incident.resolved_at
      ? new Date(incident.resolved_at).getTime()
      : null;
    return {
      id: incident.id,
      title: incident.title,
      startedAt: incident.started_at,
      resolvedAt: incident.resolved_at,
      durationSeconds: resolvedMs
        ? Math.max(0, Math.round((resolvedMs - startedMs) / 1000))
        : Math.max(0, Math.round((Date.now() - startedMs) / 1000)),
    };
  });

  // Rollup latencies are daily means, so the merged average is a
  // check-weighted mean (exact when every day has uniform volume, a close
  // approximation otherwise). Min/max are exact across both sources.
  const rawLatencySum = latencies.reduce((a, b) => a + b, 0);
  const mergedLatencyCount = latencies.length + summaryTotals.latencyCount;
  const mergedLatencySum = rawLatencySum + summaryTotals.latencySum;
  const mergedMin =
    latencies.length > 0
      ? summaryTotals.min === null
        ? Math.min(...latencies)
        : Math.min(Math.min(...latencies), summaryTotals.min)
      : (summaryTotals.min ?? 0);
  const mergedMax =
    latencies.length > 0
      ? summaryTotals.max === null
        ? Math.max(...latencies)
        : Math.max(Math.max(...latencies), summaryTotals.max)
      : (summaryTotals.max ?? 0);

  return {
    monitorId: monitor.id,
    monitorName: monitor.name,
    period,
    since,
    totalChecks,
    upChecks,
    downChecks,
    degradedChecks,
    unknownChecks,
    uptimePercent,
    coveredPercent,
    dataFrom,
    dataTo,
    windowCoveragePercent,
    avgResponseTimeMs:
      mergedLatencyCount > 0
        ? Math.round(mergedLatencySum / mergedLatencyCount)
        : 0,
    minResponseTimeMs: mergedLatencyCount > 0 ? mergedMin : 0,
    maxResponseTimeMs: mergedLatencyCount > 0 ? mergedMax : 0,
    totalDowntimeSeconds,
    incidents,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateBulkUptimeReport(
  client: SupabaseQueryClient,
  monitorIds: string[],
  period: ReportPeriod,
): Promise<UptimeReport[]> {
  const settled = await Promise.allSettled(
    monitorIds.map((id) => generateUptimeReport(client, id, period)),
  );

  const reports: UptimeReport[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value) {
      reports.push(result.value);
    } else if (result.status === "rejected") {
      console.error("[reports] Failed to generate report:", result.reason);
    }
  }
  return reports;
}
