import { describe, expect, it } from "bun:test";
import {
  getStatsWindowForMonitor,
  resetAnalyticsThrottle,
  claimAnalyticsRefresh,
  summarizeHeartbeats,
  type HeartbeatSample,
} from "@/lib/analytics";
import { HEARTBEAT_STATUS } from "@/lib/monitor-status";

const sample = (
  status: number,
  ping: number | null = null,
): HeartbeatSample => ({ status, ping, duration: null });

describe("summarizeHeartbeats", () => {
  it("returns null below the minimum sample count", () => {
    expect(
      summarizeHeartbeats([sample(HEARTBEAT_STATUS.UP, 100)], {
        hours: 24,
        minSamples: 3,
      }),
    ).toBeNull();
  });

  it("averages ping when present", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 200),
        sample(HEARTBEAT_STATUS.UP, 300),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.avg_response_time_ms).toBe(200);
  });

  it("falls back to duration when ping is absent", () => {
    const stats = summarizeHeartbeats(
      [
        { status: HEARTBEAT_STATUS.UP, ping: null, duration: 50 },
        { status: HEARTBEAT_STATUS.UP, ping: null, duration: 150 },
        { status: HEARTBEAT_STATUS.UP, ping: null, duration: 100 },
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.avg_response_time_ms).toBe(100);
  });

  it("ignores zero and null latencies rather than skewing the mean to zero", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 0),
        sample(HEARTBEAT_STATUS.UP, null),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.avg_response_time_ms).toBe(100);
  });

  it("counts DEGRADED as success, because the check returned a response", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.DEGRADED, 900),
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.success_rate_percent).toBe(100);
  });

  it("counts PENDING against the rate, since the check failed in the retry window", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.PENDING, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.success_rate_percent).toBe(75);
  });

  it("excludes MAINTENANCE from the denominator entirely", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.MAINTENANCE, null),
        sample(HEARTBEAT_STATUS.MAINTENANCE, null),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.success_rate_percent).toBe(100);
    expect(stats?.sample_count).toBe(3);
  });

  it("returns null when maintenance leaves too few conclusive checks", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.UP, 100),
        sample(HEARTBEAT_STATUS.MAINTENANCE, null),
        sample(HEARTBEAT_STATUS.MAINTENANCE, null),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats).toBeNull();
  });

  it("reports zero percent when every measured check failed", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.DOWN, 100),
        sample(HEARTBEAT_STATUS.DOWN, 100),
        sample(HEARTBEAT_STATUS.DOWN, 100),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.success_rate_percent).toBe(0);
  });

  it("rounds the rate to two decimals", () => {
    const stats = summarizeHeartbeats(
      [
        sample(HEARTBEAT_STATUS.UP, 10),
        sample(HEARTBEAT_STATUS.UP, 10),
        sample(HEARTBEAT_STATUS.UP, 10),
        sample(HEARTBEAT_STATUS.DOWN, 10),
        sample(HEARTBEAT_STATUS.DOWN, 10),
        sample(HEARTBEAT_STATUS.DOWN, 10),
        sample(HEARTBEAT_STATUS.UP, 10),
      ],
      { hours: 24, minSamples: 3 },
    );

    expect(stats?.success_rate_percent).toBe(57.14);
  });
});

describe("getStatsWindowForMonitor", () => {
  it("widens the window for slow intervals", () => {
    const fast = getStatsWindowForMonitor({ interval: 20 });
    const slow = getStatsWindowForMonitor({ interval: 600 });

    expect(slow.hours).toBeGreaterThan(fast.hours);
  });

  it("clamps an absurd interval to the one week cap", () => {
    expect(getStatsWindowForMonitor({ interval: 100_000 }).hours).toBe(168);
  });

  it("floors a tiny interval instead of collapsing the window", () => {
    expect(getStatsWindowForMonitor({ interval: 1 }).hours).toBeGreaterThan(0);
  });
});

describe("claimAnalyticsRefresh", () => {
  it("allows the first claim for an unseen monitor", () => {
    resetAnalyticsThrottle();
    expect(claimAnalyticsRefresh({ id: "m1", interval: 60 })).toBe(true);
  });

  it("claims once, then refuses inside the minimum gap", () => {
    const now = 1_000_000_000;
    expect(claimAnalyticsRefresh({ id: "m2", interval: 60 }, now)).toBe(true);
    expect(claimAnalyticsRefresh({ id: "m2", interval: 60 }, now)).toBe(false);
  });

  it("allows a claim once the gap has elapsed", () => {
    const now = 2_000_000_000;
    expect(claimAnalyticsRefresh({ id: "m3", interval: 60 }, now)).toBe(true);
    expect(
      claimAnalyticsRefresh({ id: "m3", interval: 60 }, now + 3_600_000),
    ).toBe(true);
  });

  it("throttles per monitor rather than globally", () => {
    const now = 3_000_000_000;
    expect(claimAnalyticsRefresh({ id: "m4", interval: 60 }, now)).toBe(true);
    expect(claimAnalyticsRefresh({ id: "m5", interval: 60 }, now)).toBe(true);
  });
});
