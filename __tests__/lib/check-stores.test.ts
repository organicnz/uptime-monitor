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

  it("finds a monitor inside an active window", async () => {
    const service = fakeClient({
      maintenance_monitors: {
        data: [
          {
            maintenance: {
              active: true,
              start_date: "2020-01-01T00:00:00.000Z",
              end_date: "2999-01-01T00:00:00.000Z",
            },
          },
        ],
      },
    });
    const store = createCheckStore(() => service.client);

    expect(await store.underMaintenance(MONITOR_ID)).toBe(true);
  });

  it("ignores a window that is not active", async () => {
    const service = fakeClient({
      maintenance_monitors: {
        data: [
          {
            maintenance: {
              active: false,
              start_date: "2020-01-01T00:00:00.000Z",
              end_date: "2999-01-01T00:00:00.000Z",
            },
          },
        ],
      },
    });
    const store = createCheckStore(() => service.client);

    expect(await store.underMaintenance(MONITOR_ID)).toBe(false);
  });

  it("ignores a window that has already ended", async () => {
    const service = fakeClient({
      maintenance_monitors: {
        data: [
          {
            maintenance: {
              active: true,
              start_date: "2020-01-01T00:00:00.000Z",
              end_date: "2020-02-01T00:00:00.000Z",
            },
          },
        ],
      },
    });
    const store = createCheckStore(() => service.client);

    expect(await store.underMaintenance(MONITOR_ID)).toBe(false);
  });

  it("fails loudly when the maintenance state cannot be read", async () => {
    // Silently treating an unreadable window as "not in maintenance"
    // would run checks against a monitor the operator suspended.
    const service = fakeClient({
      maintenance_monitors: { error: { message: "connection reset" } },
    });
    const store = createCheckStore(() => service.client);

    await expect(store.underMaintenance(MONITOR_ID)).rejects.toThrow(
      "Failed to read maintenance state",
    );
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

  it("writes every field of a monitor update", async () => {
    // The update is built field by field, so a field that is never
    // carried across is a field the monitor silently stops tracking.
    const service = fakeClient();
    const store = createCheckStore(() => service.client);

    await store.updateMonitor(MONITOR_ID, {
      status: 1,
      down_count: 2,
      consecutive_uptime: 3,
      last_check_at: "2026-01-01T00:00:00.000Z",
      last_status_change_at: "2026-01-02T00:00:00.000Z",
      ssl_expiry: "2026-04-01T00:00:00.000Z",
      ssl_issuer: "Let's Encrypt",
    });

    expect(service.one("update")?.payload).toEqual({
      status: 1,
      down_count: 2,
      consecutive_uptime: 3,
      last_check_at: "2026-01-01T00:00:00.000Z",
      last_status_change_at: "2026-01-02T00:00:00.000Z",
      ssl_expiry: "2026-04-01T00:00:00.000Z",
      ssl_issuer: "Let's Encrypt",
    });
  });
});

/**
 * The adapter fails loudly.
 *
 * Every method here throws on a database error rather than carrying on.
 * That is the whole point: a store that swallowed the error would leave
 * the monitor's state wrong, and a state that is quietly wrong is worse
 * than a check that failed loudly.
 */
describe("the check store fails loudly", () => {
  const cases: Array<{
    what: string;
    table: string;
    run: (store: ReturnType<typeof createCheckStore>) => Promise<unknown>;
    message: string;
  }> = [
    {
      what: "reads the previous heartbeat",
      table: "heartbeats",
      run: (store) => store.previousHeartbeat(MONITOR_ID),
      message: "Failed to read previous heartbeat",
    },
    {
      what: "records a heartbeat",
      table: "heartbeats",
      run: (store) =>
        store.recordHeartbeat({
          monitor_id: MONITOR_ID,
          status: 1,
          msg: "",
          ping: null,
          duration: 0,
          down_count: 0,
          time: "2026-01-01T00:00:00.000Z",
          error_type: null,
        }),
      message: "Failed to record heartbeat",
    },
    {
      what: "updates the monitor",
      table: "monitors",
      run: (store) => store.updateMonitor(MONITOR_ID, { status: 1 }),
      message: "Failed to update monitor state",
    },
    {
      what: "reads the certificate expiry",
      table: "monitors",
      run: (store) => store.sslExpiry(MONITOR_ID),
      message: "Failed to read SSL state",
    },
    {
      what: "looks for an open incident",
      table: "incidents",
      run: (store) => store.openIncident(MONITOR_ID),
      message: "Failed to check existing incidents",
    },
    {
      what: "opens an incident",
      table: "incidents",
      run: (store) =>
        store.createIncident({
          monitor_id: MONITOR_ID,
          title: "t",
          content: "c",
          status: 0,
          started_at: "2026-01-01T00:00:00.000Z",
        }),
      message: "Failed to create incident",
    },
    {
      what: "resolves the open incidents",
      table: "incidents",
      run: (store) => store.resolveIncidents(MONITOR_ID),
      message: "Failed to resolve incidents",
    },
  ];

  for (const { what, table, run, message } of cases) {
    it(`fails when it ${what}`, async () => {
      const service = fakeClient({
        [table]: { error: { message: "connection reset" } },
      });
      const store = createCheckStore(() => service.client);

      await expect(run(store)).rejects.toThrow(message);
    });
  }
});
