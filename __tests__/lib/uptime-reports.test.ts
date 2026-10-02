import { describe, expect, it } from "bun:test";
import { generateUptimeReport } from "@/lib/uptime-reports";
import { HEARTBEAT_STATUS } from "@/lib/monitor-status";
import type { SupabaseQueryClient } from "@/lib/uptime-reports";

type Row = Record<string, unknown>;

/**
 * Minimal stub shaped like the Supabase query builder. Only the chain the
 * report module actually uses is implemented, and each call is recorded so a
 * test can assert on the filters applied.
 */
function stubClient(options: {
  monitor?: Row | null;
  heartbeats?: Row[];
  incidents?: Row[];
  monitorError?: { message: string } | null;
  heartbeatsError?: { message: string } | null;
}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

  const make = (table: string, result: { data: unknown; error: unknown }) => {
    const filters: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {};

    const chain = (acc: Record<string, unknown>) => {
      acc.eq = (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain(acc);
      };
      acc.gte = (column: string, value: unknown) => {
        filters.push([column, value]);
        return chain(acc);
      };
      acc.order = () => chain(acc);
      acc.limit = () => Promise.resolve(result);
      acc.maybeSingle = () => Promise.resolve(result);
      acc.then = (
        onfulfilled?: (value: unknown) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onfulfilled, onrejected);
      return acc;
    };
    chain(builder);
    calls.push({ table, filters });
    return builder;
  };

  const client = {
    from(table: string) {
      if (table === "monitors") {
        return {
          select: () =>
            make(table, {
              data:
                "monitor" in options
                  ? options.monitor
                  : { id: "m1", name: "API" },
              error: options.monitorError ?? null,
            }),
        };
      }
      if (table === "heartbeats") {
        return {
          select: () =>
            make(table, {
              data: options.heartbeats ?? [],
              error: options.heartbeatsError ?? null,
            }),
        };
      }
      return {
        select: () =>
          make(table, { data: options.incidents ?? [], error: null }),
      };
    },
  } as unknown as SupabaseQueryClient;

  return { client, calls };
}

const heartbeat = (status: number, ping: number | null) => ({
  status,
  ping,
  duration: null,
  time: new Date().toISOString(),
});

describe("generateUptimeReport", () => {
  it("returns null when the monitor is not visible to the caller", async () => {
    const { client } = stubClient({ monitor: null });
    expect(await generateUptimeReport(client, "m1", "24h")).toBeNull();
  });

  it("scopes the heartbeat and incident reads to the monitor", async () => {
    const { client, calls } = stubClient({ heartbeats: [] });
    await generateUptimeReport(client, "m1", "24h");

    const heartbeats = calls.find((c) => c.table === "heartbeats");
    expect(heartbeats?.filters).toContainEqual(["monitor_id", "m1"]);
    expect(heartbeats?.filters.some(([k]) => k === "time")).toBe(true);
  });

  it("reports 100% uptime with no data rather than dividing by zero", async () => {
    const { client } = stubClient({ heartbeats: [] });
    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.uptimePercent).toBe(100);
    expect(report?.coveredPercent).toBe(0);
    expect(report?.totalChecks).toBe(0);
  });

  it("counts DEGRADED as healthy for uptime but tracks it separately", async () => {
    const { client } = stubClient({
      heartbeats: [
        heartbeat(HEARTBEAT_STATUS.UP, 100),
        heartbeat(HEARTBEAT_STATUS.DEGRADED, 900),
        heartbeat(HEARTBEAT_STATUS.UP, 100),
        heartbeat(HEARTBEAT_STATUS.UP, 100),
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.degradedChecks).toBe(1);
    expect(report?.upChecks).toBe(3);
    expect(report?.uptimePercent).toBe(75);
  });

  it("excludes MAINTENANCE from the coverage denominator", async () => {
    const { client } = stubClient({
      heartbeats: [
        heartbeat(HEARTBEAT_STATUS.UP, 100),
        heartbeat(HEARTBEAT_STATUS.UP, 100),
        heartbeat(HEARTBEAT_STATUS.MAINTENANCE, null),
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.unknownChecks).toBe(1);
    expect(report?.uptimePercent).toBe(100);
    expect(report?.coveredPercent).toBe(66.67);
  });

  it("reports zero response times when nothing responded", async () => {
    const { client } = stubClient({
      heartbeats: [heartbeat(HEARTBEAT_STATUS.DOWN, null)],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.avgResponseTimeMs).toBe(0);
    expect(report?.maxResponseTimeMs).toBe(0);
  });

  it("computes min, max and mean latency across the window", async () => {
    const { client } = stubClient({
      heartbeats: [
        heartbeat(HEARTBEAT_STATUS.UP, 100),
        heartbeat(HEARTBEAT_STATUS.UP, 300),
        heartbeat(HEARTBEAT_STATUS.UP, 200),
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.minResponseTimeMs).toBe(100);
    expect(report?.maxResponseTimeMs).toBe(300);
    expect(report?.avgResponseTimeMs).toBe(200);
  });

  it("throws when the heartbeat read fails so the caller can 500", async () => {
    const { client } = stubClient({ heartbeatsError: { message: "boom" } });
    await expect(generateUptimeReport(client, "m1", "24h")).rejects.toThrow(
      "boom",
    );
  });

  it("computes incident duration from start and resolution", async () => {
    const started = new Date(Date.now() - 3_600_000).toISOString();
    const resolved = new Date(Date.now() - 1_800_000).toISOString();

    const { client } = stubClient({
      heartbeats: [],
      incidents: [
        {
          id: "i1",
          title: "Outage",
          started_at: started,
          resolved_at: resolved,
        },
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.incidents).toHaveLength(1);
    expect(report?.incidents[0]?.durationSeconds).toBe(1800);
  });

  it("reports an open incident as still running", async () => {
    const started = new Date(Date.now() - 600_000).toISOString();
    const { client } = stubClient({
      heartbeats: [],
      incidents: [
        { id: "i1", title: "Ongoing", started_at: started, resolved_at: null },
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    expect(report?.incidents[0]?.resolvedAt).toBeNull();
    expect(report?.incidents[0]?.durationSeconds).toBeGreaterThanOrEqual(600);
  });

  it("extrapolates downtime from failed checks rather than incident length", async () => {
    const { client } = stubClient({
      heartbeats: [
        heartbeat(HEARTBEAT_STATUS.DOWN, null),
        heartbeat(HEARTBEAT_STATUS.DOWN, null),
      ],
    });

    const report = await generateUptimeReport(client, "m1", "24h");

    // Two samples across a 24h window imply 12h per check, so both were down.
    expect(report?.totalDowntimeSeconds).toBe(86_400);
  });
});
