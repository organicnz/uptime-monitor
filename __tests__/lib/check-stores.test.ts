import { describe, expect, it } from "bun:test";

import { createSupabaseStore } from "@/lib/analytics";
import { createSupabaseStore as createCheckStore } from "@/lib/monitor-checker";

import { fakeClient } from "./fake-supabase";

/**
 * The remaining Supabase adapters.
 *
 * The same question as the channel store's: which query, with which
 * filters. A window that read the wrong range of heartbeats would report
 * an uptime that is not the uptime; an incident lookup that did not filter
 * on the open status would resolve an incident that was never opened.
 */

const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("the analytics store", () => {
  it("reads the heartbeats in a window, newest first", async () => {
    const service = fakeClient({
      heartbeats: {
        data: [{ status: 1, ping: 100, duration: null }],
      },
    });
    const store = createSupabaseStore(() => service.client);

    const result = await store.recentHeartbeats(
      MONITOR_ID,
      "2026-01-01T00:00:00.000Z",
    );

    expect(result.samples).toEqual([{ status: 1, ping: 100, duration: null }]);
    expect(service.one("select")?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
      ["time", "2026-01-01T00:00:00.000Z"],
    ]);
  });

  it("reports an error reading the heartbeats", async () => {
    const service = fakeClient({
      heartbeats: { error: { message: "connection reset" } },
    });
    const store = createSupabaseStore(() => service.client);

    expect(
      await store.recentHeartbeats(MONITOR_ID, "2026-01-01T00:00:00.000Z"),
    ).toEqual({ samples: [], error: "connection reset" });
  });

  it("writes the aggregate back onto the monitor", async () => {
    const service = fakeClient();
    const store = createSupabaseStore(() => service.client);

    await store.writeStats(MONITOR_ID, {
      avg_response_time_ms: 120,
      success_rate_percent: 99,
      sample_count: 500,
    });

    const update = service.one("update");
    expect(update?.payload).toEqual({
      avg_response_time_ms: 120,
      success_rate_percent: 99,
    });
    expect(update?.filters).toEqual([["id", MONITOR_ID]]);
  });
});

describe("the check store", () => {
  it("reads the windows a monitor is in", async () => {
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.underMaintenance(MONITOR_ID);

    expect(service.one("select")?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
    ]);
  });

  it("reads the most recent heartbeat of a monitor", async () => {
    const service = fakeClient({
      heartbeats: { data: { status: 0, down_count: 2 } },
    });
    const store = createCheckStore(() => service.client);

    const result = await store.previousHeartbeat(MONITOR_ID);

    expect(result).toEqual({ status: 0, down_count: 2 });
    expect(service.one("select")?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
    ]);
  });

  it("records a heartbeat", async () => {
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.recordHeartbeat({
      monitor_id: MONITOR_ID,
      status: 1,
      msg: "42ms",
      ping: 42,
      duration: 50,
      down_count: 0,
      time: "2026-01-01T00:00:00.000Z",
      error_type: null,
    });

    expect(service.one("insert")?.payload).toMatchObject({
      monitor_id: MONITOR_ID,
      status: 1,
      down_count: 0,
    });
  });

  it("updates the monitor's row", async () => {
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.updateMonitor(MONITOR_ID, { status: 0, down_count: 3 });

    const update = service.one("update");
    expect(update?.payload).toEqual({ status: 0, down_count: 3 });
    expect(update?.filters).toEqual([["id", MONITOR_ID]]);
  });

  it("reads the certificate expiry recorded on the monitor", async () => {
    const service = fakeClient({
      monitors: { data: { ssl_expiry: "2026-04-01T00:00:00.000Z" } },
    });
    const store = createCheckStore(() => service.client);

    expect(await store.sslExpiry(MONITOR_ID)).toBe("2026-04-01T00:00:00.000Z");
  });

  it("looks for an open incident and nothing else", async () => {
    // An incident that was already resolved must not be reopened, and an
    // open one must not be duplicated.
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.openIncident(MONITOR_ID);

    expect(service.one("select")?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
      ["status", 0],
    ]);
  });

  it("opens an incident", async () => {
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.createIncident({
      monitor_id: MONITOR_ID,
      title: "API is down",
      content: "no",
      status: 0,
      started_at: "2026-01-01T00:00:00.000Z",
    });

    expect(service.one("insert")?.payload).toEqual({
      monitor_id: MONITOR_ID,
      title: "API is down",
      content: "no",
      status: 0,
      started_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("resolves the open incidents and nothing else", async () => {
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.resolveIncidents(MONITOR_ID);

    const update = service.one("update");
    expect(update?.payload).toMatchObject({ status: 1 });
    expect(update?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
      ["status", 0],
    ]);
  });
});
