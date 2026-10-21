import { describe, expect, it } from "bun:test";

import {
  type AnalyticsStore,
  claimAnalyticsRefresh,
  computeRollingStats,
  getStatsWindowForMonitor,
  type HeartbeatSample,
  resetAnalyticsThrottle,
  summarizeHeartbeats,
  updateMonitorAnalytics,
} from "@/lib/analytics";
import { HEARTBEAT_STATUS } from "@/lib/monitor-status";

/**
 * The rolling aggregate the dashboard shows next to a monitor: how long it
 * took, and how often it was up.
 *
 * The store is a port, so the fake below is a plain object. Nothing here
 * mocks a module — `mock.module` in Bun is process-wide, and a test that
 * replaced one would silently change what every other test file sees.
 */

const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function sample(overrides: Partial<HeartbeatSample> = {}): HeartbeatSample {
  return {
    status: HEARTBEAT_STATUS.UP,
    ping: 100,
    duration: null,
    ...overrides,
  };
}

function store(
  options: {
    samples?: HeartbeatSample[];
    readError?: string;
    writeError?: string;
  } = {},
): AnalyticsStore & {
  writes: Array<{ monitorId: string; stats: unknown }>;
} {
  const writes: Array<{ monitorId: string; stats: unknown }> = [];

  return {
    writes,
    async recentHeartbeats() {
      if (options.readError) return { samples: [], error: options.readError };
      return { samples: options.samples ?? [], error: null };
    },
    async writeStats(monitorId, stats) {
      writes.push({ monitorId, stats });
      return { error: options.writeError ?? null };
    },
  };
}

describe("summarizeHeartbeats", () => {
  it("averages the response time", () => {
    const stats = summarizeHeartbeats(
      [sample({ ping: 100 }), sample({ ping: 200 })],
      { hours: 24, minSamples: 2 },
    );

    expect(stats?.avg_response_time_ms).toBe(150);
  });

  it("counts a degraded check as a success", () => {
    // A degraded check is slow, not down. Folding it into the failure
    // count would report a latency regression as an outage.
    const stats = summarizeHeartbeats(
      [
        sample({ status: HEARTBEAT_STATUS.UP }),
        sample({ status: HEARTBEAT_STATUS.DEGRADED }),
      ],
      { hours: 24, minSamples: 2 },
    );

    expect(stats?.success_rate_percent).toBe(100);
  });

  it("leaves a maintenance window out of the denominator", () => {
    // Planned work is an intentional suspension, not downtime.
    const stats = summarizeHeartbeats(
      [
        sample({ status: HEARTBEAT_STATUS.UP }),
        sample({ status: HEARTBEAT_STATUS.MAINTENANCE }),
      ],
      { hours: 24, minSamples: 1 },
    );

    expect(stats?.success_rate_percent).toBe(100);
  });

  it("counts a pending check against the rate", () => {
    // A pending check failed and is still inside the retry window.
    const stats = summarizeHeartbeats(
      [
        sample({ status: HEARTBEAT_STATUS.UP }),
        sample({ status: HEARTBEAT_STATUS.PENDING }),
      ],
      { hours: 24, minSamples: 1 },
    );

    expect(stats?.success_rate_percent).toBe(50);
  });

  it("says nothing when there is too little data", () => {
    const stats = summarizeHeartbeats([sample()], {
      hours: 24,
      minSamples: 5,
    });

    expect(stats).toBeNull();
  });
});

describe("getStatsWindowForMonitor", () => {
  it("scales the window with the check interval", () => {
    const window = getStatsWindowForMonitor({ interval: 60 });

    expect(window.hours).toBeGreaterThan(0);
    expect(window.hours).toBeLessThanOrEqual(168);
  });
});

describe("claimAnalyticsRefresh", () => {
  it("claims the first refresh and refuses the next one", () => {
    resetAnalyticsThrottle();
    const monitor = { id: "monitor-1", interval: 60 };

    expect(claimAnalyticsRefresh(monitor)).toBe(true);
    expect(claimAnalyticsRefresh(monitor)).toBe(false);
  });
});

describe("computeRollingStats", () => {
  it("reads the heartbeats and summarises them", async () => {
    const stats = await computeRollingStats(
      MONITOR_ID,
      { hours: 24, minSamples: 1 },
      store({
        samples: [sample({ ping: 120 }), sample({ ping: 80 })],
      }),
    );

    expect(stats?.avg_response_time_ms).toBe(100);
    expect(stats?.success_rate_percent).toBe(100);
  });

  it("returns nothing when the heartbeats cannot be read", async () => {
    const stats = await computeRollingStats(
      MONITOR_ID,
      { hours: 24, minSamples: 1 },
      store({ readError: "connection reset" }),
    );

    expect(stats).toBeNull();
  });
});

describe("updateMonitorAnalytics", () => {
  it("writes the aggregate back onto the monitor", async () => {
    resetAnalyticsThrottle();
    const analytics = store({
      samples: [
        sample({ ping: 120 }),
        sample({ ping: 80 }),
        sample({ ping: 100 }),
      ],
    });

    await updateMonitorAnalytics({ id: MONITOR_ID, interval: 60 }, analytics);

    expect(analytics.writes).toHaveLength(1);
    expect(analytics.writes[0]?.monitorId).toBe(MONITOR_ID);
    expect(analytics.writes[0]?.stats).toMatchObject({
      avg_response_time_ms: 100,
      success_rate_percent: 100,
    });
  });

  it("does not write when the heartbeats cannot be read", async () => {
    resetAnalyticsThrottle();
    const analytics = store({ readError: "connection reset" });

    await updateMonitorAnalytics({ id: MONITOR_ID, interval: 60 }, analytics);

    expect(analytics.writes).toHaveLength(0);
  });

  it("does not write twice for the same window", async () => {
    resetAnalyticsThrottle();
    const analytics = store({
      samples: [sample(), sample(), sample()],
    });

    await updateMonitorAnalytics({ id: MONITOR_ID, interval: 60 }, analytics);
    await updateMonitorAnalytics({ id: MONITOR_ID, interval: 60 }, analytics);

    expect(analytics.writes).toHaveLength(1);
  });
});
