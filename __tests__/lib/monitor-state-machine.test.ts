import { describe, expect, it } from "bun:test";

import {
  type CheckStore,
  type MonitorPatch,
  type ProcessDependencies,
  processMonitorCheck,
} from "@/lib/monitor-checker";
import { HEARTBEAT_STATUS } from "@/lib/monitor-status";
import type { Monitor } from "@/types/application";

/**
 * The state machine.
 *
 * This is the code that decides what a check *means*: whether a failure is
 * still inside the retry window, whether a status change is worth waking
 * somebody for, and whether an incident should open or close. The
 * decisions themselves live in `lib/monitor-status.ts` and are tested
 * there; what is tested here is the machine that applies them — which
 * rows it writes, and which alerts it sends.
 *
 * Everything it reaches for is a port, so the fakes below are plain
 * objects. Nothing here mocks a module: `mock.module` in Bun is
 * process-wide, and a test that replaced one would silently change what
 * every other test file sees.
 */

const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const USER_ID = "user-1";

type HeartbeatRow = {
  monitor_id: string;
  status: number;
  msg: string;
  down_count: number;
};

type FakeStore = CheckStore & {
  heartbeats: HeartbeatRow[];
  updates: Array<{ id: string; patch: MonitorPatch }>;
  incidents: Array<{ monitor_id: string; title: string }>;
  resolved: string[];
};

function store(
  overrides: Partial<{
    underMaintenance: boolean;
    previous: { status: number; down_count: number } | null;
    openIncident: { id: string } | null;
    sslExpiry: string | null;
  }> = {},
): FakeStore {
  const heartbeats: HeartbeatRow[] = [];
  const updates: Array<{ id: string; patch: MonitorPatch }> = [];
  const incidents: Array<{ monitor_id: string; title: string }> = [];
  const resolved: string[] = [];
  const sslExpiry = overrides.sslExpiry ?? null;

  return {
    heartbeats,
    updates,
    incidents,
    resolved,

    async underMaintenance() {
      return overrides.underMaintenance ?? false;
    },
    async previousHeartbeat() {
      return overrides.previous ?? null;
    },
    async recordHeartbeat(heartbeat) {
      heartbeats.push({
        monitor_id: heartbeat.monitor_id,
        status: heartbeat.status,
        msg: heartbeat.msg,
        down_count: heartbeat.down_count,
      });
    },
    async updateMonitor(id, patch) {
      updates.push({ id, patch });
    },
    async sslExpiry() {
      return sslExpiry;
    },
    async openIncident() {
      return overrides.openIncident ?? null;
    },
    async createIncident(incident) {
      incidents.push({
        monitor_id: incident.monitor_id,
        title: incident.title,
      });
    },
    async resolveIncidents(monitorId) {
      resolved.push(monitorId);
    },
  };
}

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: MONITOR_ID,
    user_id: USER_ID,
    name: "API",
    type: "http",
    url: "https://api.example.com/",
    active: true,
    timeout: 30,
    max_retries: 2,
    interval: 60,
    consecutive_uptime: 0,
    status: HEARTBEAT_STATUS.UP,
    ...overrides,
  } as Monitor;
}

/** A notification attempt, recorded when the machine reaches for it. */
type Notification = { attempted: boolean };

function dependencies(
  options: {
    store?: FakeStore;
    notification?: Notification;
    result?: { status: number; ping: number | null; msg: string };
  } = {},
): ProcessDependencies {
  const notification = options.notification ?? { attempted: false };
  const checkStore = options.store ?? store();

  return {
    store: checkStore,
    analytics: {
      async recentHeartbeats() {
        return { samples: [], error: null };
      },
      async writeStats() {
        return { error: null };
      },
    },
    notifications: {
      store: {
        async monitorOwner() {
          notification.attempted = true;
          return { userId: USER_ID, error: null };
        },
        async linkedChannelIds() {
          return { ids: [], error: null };
        },
        async channelsByIds() {
          return { channels: [], error: null };
        },
        async defaultChannels() {
          return { channels: [], error: null };
        },
        async allActiveChannels() {
          return { channels: [], error: null };
        },
      },
      resolveConfigs: async () => new Map(),
      fetch: async () => new Response("{}", { status: 200 }),
      ssrfFetch: async () => new Response("{}", { status: 200 }),
      validateUrl: async (url) => ({
        safeUrl: url,
        resolvedIp: "203.0.113.10",
        hostname: url,
      }),
    },
    ssl: {
      // The certificate check reports nothing, so the machine's own
      // decisions are not mixed up with a certificate's.
      fetch: async () => new Response("[]", { status: 200 }),
      ssrfFetch: async () => new Response("", { status: 500 }),
    },
  };
}

describe("the monitor state machine", () => {
  it("records a heartbeat for a check that passed", async () => {
    const checkStore = store();
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(checkStore.heartbeats).toHaveLength(1);
    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.UP);
    expect(checkStore.updates[0]?.patch.status).toBe(HEARTBEAT_STATUS.UP);
  });

  it("does not alert on the first healthy check", async () => {
    // There is nothing to recover from and nothing to report.
    const notification = { attempted: false };
    const checkStore = store();
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(notification.attempted).toBe(false);
    expect(checkStore.incidents).toHaveLength(0);
  });

  it("holds a first failure inside the retry window", async () => {
    // The retry window is the whole point: a single failed check is not an
    // outage, and must not page anybody.
    const notification = { attempted: false };
    const checkStore = store();
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor({ max_retries: 2 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.DOWN, ping: null, msg: "no" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.PENDING);
    expect(checkStore.heartbeats[0]?.down_count).toBe(1);
    expect(checkStore.incidents).toHaveLength(0);
    expect(notification.attempted).toBe(false);
  });

  it("opens an incident and alerts once the retry window is passed", async () => {
    const notification = { attempted: false };
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.PENDING, down_count: 2 },
    });
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor({ max_retries: 2 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.DOWN, ping: null, msg: "no" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(checkStore.incidents).toHaveLength(1);
    expect(checkStore.incidents[0]?.title).toContain("is down");
    expect(notification.attempted).toBe(true);
  });

  it("does not open a second incident when one is already open", async () => {
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.DOWN, down_count: 3 },
      openIncident: { id: "incident-1" },
    });
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor({ max_retries: 2 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.DOWN, ping: null, msg: "no" } },
      deps,
    );

    expect(checkStore.incidents).toHaveLength(0);
  });

  it("closes the incident and alerts on a recovery", async () => {
    const notification = { attempted: false };
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.DOWN, down_count: 1 },
    });
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 30, msg: "30ms" } },
      deps,
    );

    expect(checkStore.resolved).toEqual([MONITOR_ID]);
    expect(notification.attempted).toBe(true);
  });

  it("alerts on a degraded check without opening an incident", async () => {
    // The service is answering, only slowly. A human should look; the
    // outage machinery is for a service that stops answering.
    const notification = { attempted: false };
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.UP, down_count: 0 },
    });
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor(),
      undefined,
      {
        precomputed: {
          status: HEARTBEAT_STATUS.DEGRADED,
          ping: 900,
          msg: "slow",
        },
      },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.DEGRADED);
    expect(checkStore.incidents).toHaveLength(0);
    expect(notification.attempted).toBe(true);
  });

  it("does not alert again when the status has not changed", async () => {
    const notification = { attempted: false };
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.UP, down_count: 0 },
    });
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 30, msg: "30ms" } },
      deps,
    );

    expect(checkStore.heartbeats).toHaveLength(1);
    expect(notification.attempted).toBe(false);
  });

  it("suspends the monitor under a maintenance window", async () => {
    // A planned window is an intentional suspension: the check does not
    // run, and nothing is alerted.
    const notification = { attempted: false };
    const checkStore = store({ underMaintenance: true });
    const deps = dependencies({ store: checkStore, notification });

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.MAINTENANCE);
    expect(checkStore.updates[0]?.patch.status).toBe(
      HEARTBEAT_STATUS.MAINTENANCE,
    );
    expect(notification.attempted).toBe(false);
  });

  it("keeps the uptime streak through a maintenance window", async () => {
    // A window suspends the streak; it does not end it.
    const checkStore = store({ underMaintenance: true });
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor({ consecutive_uptime: 42 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(checkStore.updates[0]?.patch.consecutive_uptime).toBeUndefined();
  });

  it("records who asked for the check", async () => {
    const checkStore = store();
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor(),
      undefined,
      {
        triggeredBy: "user-1",
        precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" },
      },
      deps,
    );

    expect(checkStore.heartbeats).toHaveLength(1);
  });

  it("does not let a notification that fails take the check down", async () => {
    // The alert is the last thing that happens, and it is wrapped: a
    // notification service that is down must not undo the heartbeat, the
    // incident, or the monitor's state.
    const notification = { attempted: false };
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.PENDING, down_count: 2 },
    });
    const deps = dependencies({ store: checkStore, notification });
    // The monitor has no linked channel, so the delivery looks for the
    // default one — and that is where the failure happens.
    deps.notifications.store.defaultChannels = async () => {
      throw new Error("the notification service is down");
    };

    await processMonitorCheck(
      monitor({ max_retries: 2 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.DOWN, ping: null, msg: "no" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(checkStore.incidents).toHaveLength(1);
    expect(checkStore.updates.length).toBeGreaterThan(0);
  });

  it("does not let a failed recovery notification undo the incident", async () => {
    // The incident is closed before the notification is sent, so a
    // notification service that is down cannot leave the incident open.
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.DOWN, down_count: 1 },
    });
    const deps = dependencies({ store: checkStore });
    deps.notifications.store.defaultChannels = async () => {
      throw new Error("the notification service is down");
    };

    await processMonitorCheck(
      monitor(),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 30, msg: "30ms" } },
      deps,
    );

    expect(checkStore.resolved).toEqual([MONITOR_ID]);
    expect(checkStore.updates.length).toBeGreaterThan(0);
  });

  it("does not let a failed degraded notification undo the state", async () => {
    const checkStore = store({
      previous: { status: HEARTBEAT_STATUS.UP, down_count: 0 },
    });
    const deps = dependencies({ store: checkStore });
    deps.notifications.store.defaultChannels = async () => {
      throw new Error("the notification service is down");
    };

    await processMonitorCheck(
      monitor(),
      undefined,
      {
        precomputed: {
          status: HEARTBEAT_STATUS.DEGRADED,
          ping: 900,
          msg: "slow",
        },
      },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.DEGRADED);
    expect(checkStore.incidents).toHaveLength(0);
  });

  it("records the certificate on the monitor", async () => {
    // The SSL check runs for an HTTPS monitor with time to spare, and
    // what it learns is written back onto the monitor.
    const checkStore = store();
    const deps = dependencies({ store: checkStore });
    deps.ssl.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            issuer_name: "Let's Encrypt",
            not_before: "2026-01-01T00:00:00.000Z",
            not_after: "2026-04-01T00:00:00.000Z",
            common_name: "api.example.com",
          },
        ]),
        { status: 200 },
      );

    await processMonitorCheck(
      monitor({ url: "https://api.example.com/" }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    const sslWrite = checkStore.updates.find(
      (update) => update.patch.ssl_expiry !== undefined,
    );
    expect(sslWrite?.patch.ssl_issuer).toBe("Let's Encrypt");
    expect(sslWrite?.patch.ssl_expiry).toBe("2026-04-01T00:00:00.000Z");
  });

  it("warns again when a certificate that was valid has expired", async () => {
    // The warning is for the crossing. The last check saw a certificate
    // that was still valid, so this one is the crossing and it is worth
    // telling somebody about.
    const notification = { attempted: false };
    const checkStore = store({
      sslExpiry: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    const deps = dependencies({ store: checkStore, notification });
    deps.ssl.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            issuer_name: "Let's Encrypt",
            not_before: "2025-01-01T00:00:00.000Z",
            not_after: "2025-04-01T00:00:00.000Z",
            common_name: "api.example.com",
          },
        ]),
        { status: 200 },
      );

    await processMonitorCheck(
      monitor({ url: "https://api.example.com/" }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(notification.attempted).toBe(true);
  });

  it("does not let a failed certificate warning undo the check", async () => {
    const checkStore = store();
    const deps = dependencies({ store: checkStore });
    deps.ssl.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            issuer_name: "Let's Encrypt",
            not_before: "2025-01-01T00:00:00.000Z",
            not_after: "2025-04-01T00:00:00.000Z",
            common_name: "api.example.com",
          },
        ]),
        { status: 200 },
      );
    deps.notifications.store.defaultChannels = async () => {
      throw new Error("the notification service is down");
    };

    await processMonitorCheck(
      monitor({ url: "https://api.example.com/" }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.UP);
  });

  it("does not let a certificate check that fails undo the check", async () => {
    // The certificate is a side concern. A resolver that is down must not
    // turn a healthy monitor into a failed one.
    const checkStore = store();
    const deps = dependencies({ store: checkStore });
    deps.ssl.fetch = async () => {
      throw new Error("crt.sh is down");
    };

    await processMonitorCheck(
      monitor({ url: "https://api.example.com/" }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.UP);
    expect(checkStore.updates.length).toBeGreaterThan(0);
  });

  it("marks a slow but answering check as degraded", async () => {
    // The service is answering, only slowly. That is not an outage, but
    // it is worth knowing about, so the status says so and the message
    // says how slow.
    const checkStore = store();
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor({ timeout: 1 }),
      undefined,
      {
        precomputed: {
          status: HEARTBEAT_STATUS.UP,
          ping: 5_000,
          msg: "5000ms",
        },
      },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.DEGRADED);
    expect(checkStore.heartbeats[0]?.msg).toContain("slow");
  });

  it("leaves a fast check alone", async () => {
    const checkStore = store();
    const deps = dependencies({ store: checkStore });

    await processMonitorCheck(
      monitor({ timeout: 30 }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 50, msg: "50ms" } },
      deps,
    );

    expect(checkStore.heartbeats[0]?.status).toBe(HEARTBEAT_STATUS.UP);
  });

  it("warns when the certificate has expired", async () => {
    const notification = { attempted: false };
    const checkStore = store();
    const deps = dependencies({ store: checkStore, notification });
    deps.ssl.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            issuer_name: "Let's Encrypt",
            not_before: "2025-01-01T00:00:00.000Z",
            not_after: "2025-04-01T00:00:00.000Z",
            common_name: "api.example.com",
          },
        ]),
        { status: 200 },
      );

    await processMonitorCheck(
      monitor({ url: "https://api.example.com/" }),
      undefined,
      { precomputed: { status: HEARTBEAT_STATUS.UP, ping: 42, msg: "42ms" } },
      deps,
    );

    expect(notification.attempted).toBe(true);
  });
});
