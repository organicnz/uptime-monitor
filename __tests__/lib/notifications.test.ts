import { describe, expect, it } from "bun:test";

import type {
  NotificationConfig,
  NotificationType,
} from "@/lib/notification-types";
import {
  type NotificationDependencies,
  type NotificationPayload,
  type NotificationStore,
  notifyMonitor,
  notifyUser,
  sendNotification,
} from "@/lib/notifications";

/**
 * The delivery path is the code that contacts a vendor with a credential,
 * so the tests are about one thing above all: a user-supplied destination
 * is filtered, a fixed-vendor one is not, and a credential never reaches a
 * destination the user chose without the filter seeing it first.
 *
 * Everything the module reaches for is a port, so the fakes below are plain
 * objects. Nothing here mocks a module — `mock.module` in Bun is
 * process-wide, and a test that replaced one would silently change what
 * every other test file sees.
 */

const payload: NotificationPayload = {
  title: "Monitor down",
  message: "The service is unreachable",
  monitorName: "API",
  monitorUrl: "https://api.example.com",
  status: "down",
  timestamp: "2026-09-27T09:00:00.000Z",
};

const USER_ID = "user-1";
const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CHANNEL_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

type Channel = {
  id: string;
  user_id: string;
  type: NotificationType;
  name: string;
  config: Record<string, unknown>;
  active: boolean;
};

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    id: CHANNEL_ID,
    user_id: USER_ID,
    type: "telegram",
    name: "Ops",
    config: { chat_id: "123" },
    active: true,
    ...overrides,
  };
}

type FakeStore = NotificationStore & {
  /** Every monitor id whose owner was looked up. */
  looked: string[];
};

function fakeStore(
  overrides: Partial<{
    ownerId: string | null;
    ownerError: string | null;
    linkedIds: string[];
    linkError: string | null;
    channels: Channel[];
    channelError: string | null;
    defaultChannels: Channel[];
    defaultError: string | null;
    allChannels: Channel[];
    allError: string | null;
  }> = {},
): FakeStore {
  const store: FakeStore = {
    looked: [],

    async monitorOwner(monitorId) {
      store.looked.push(monitorId);
      if (overrides.ownerError) {
        return { userId: null, error: overrides.ownerError };
      }
      // `ownerId: null` means "no such monitor", which is different from
      // "not overridden".
      const ownerId =
        "ownerId" in overrides ? (overrides.ownerId ?? null) : USER_ID;
      return { userId: ownerId, error: null };
    },

    async linkedChannelIds() {
      if (overrides.linkError) return { ids: [], error: overrides.linkError };
      return { ids: overrides.linkedIds ?? [], error: null };
    },

    async channelsByIds() {
      if (overrides.channelError) {
        return { channels: [], error: overrides.channelError };
      }
      return { channels: overrides.channels ?? [channel()], error: null };
    },

    async defaultChannels() {
      if (overrides.defaultError) {
        return { channels: [], error: overrides.defaultError };
      }
      return {
        channels: overrides.defaultChannels ?? [channel()],
        error: null,
      };
    },

    async allActiveChannels() {
      if (overrides.allError) {
        return { channels: [], error: overrides.allError };
      }
      return { channels: overrides.allChannels ?? [channel()], error: null };
    },
  };

  return store;
}

type Sent = { url: string; init: RequestInit };

function dependencies(
  options: {
    store?: NotificationStore;
    configs?: Map<string, NotificationConfig>;
    sent?: Sent[];
    ssrfSent?: Sent[];
    validate?: (url: string) => void;
  } = {},
): NotificationDependencies {
  const sent = options.sent ?? [];
  const ssrfSent = options.ssrfSent ?? [];
  const configs = options.configs ?? new Map<string, NotificationConfig>();

  const resolveConfigs: NotificationDependencies["resolveConfigs"] = async (
    channels,
  ) => {
    const resolved = new Map<string, NotificationConfig>();
    for (const candidate of channels) {
      const config = configs.get(candidate.id);
      if (config) resolved.set(candidate.id, config);
    }
    return resolved;
  };

  return {
    store: options.store ?? fakeStore(),
    resolveConfigs,
    fetch: async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    ssrfFetch: async (url: string, init?: RequestInit) => {
      ssrfSent.push({ url, init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    validateUrl: async (url: string) => {
      options.validate?.(url);
      return { safeUrl: url, resolvedIp: "93.184.216.34", hostname: url };
    },
  };
}

describe("sendNotification", () => {
  it("filters a user-supplied destination before it is contacted", async () => {
    // A webhook URL is chosen by the user, so it goes through the SSRF
    // filter — both the pre-flight check and the protected transport.
    const sent: Sent[] = [];
    const ssrfSent: Sent[] = [];
    const validated: string[] = [];
    const deps = dependencies({
      sent,
      ssrfSent,
      validate: (url) => validated.push(url),
    });

    const result = await sendNotification(
      "webhook",
      { url: "https://hooks.example.com/abc" },
      payload,
      deps,
    );

    expect(result.success).toBe(true);
    expect(validated).toEqual(["https://hooks.example.com/abc"]);
    expect(ssrfSent).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it("refuses a destination the filter blocks", async () => {
    // The pre-flight check runs first, so a blocked destination is
    // reported as blocked rather than as a generic fetch failure.
    const ssrfSent: Sent[] = [];
    const deps = dependencies({ ssrfSent });
    deps.validateUrl = async () => {
      throw new Error("Target is a private address");
    };

    const result = await sendNotification(
      "webhook",
      { url: "http://127.0.0.1/secret" },
      payload,
      deps,
    );

    expect(result).toEqual({
      success: false,
      error: "URL blocked by SSRF filter: Target is a private address",
    });
    expect(ssrfSent).toHaveLength(0);
  });

  it("does not filter a fixed-vendor destination", async () => {
    // The Telegram host is part of the integration, not user input, so
    // there is nothing for the filter to check.
    const sent: Sent[] = [];
    const ssrfSent: Sent[] = [];
    const validated: string[] = [];
    const deps = dependencies({
      sent,
      ssrfSent,
      validate: (url) => validated.push(url),
    });

    const result = await sendNotification(
      "telegram",
      { bot_token: "t", chat_id: "123" },
      payload,
      deps,
    );

    expect(result.success).toBe(true);
    expect(validated).toHaveLength(0);
    expect(sent).toHaveLength(1);
    expect(ssrfSent).toHaveLength(0);
  });
});

describe("notifyMonitor", () => {
  it("sends to the channels linked to the monitor", async () => {
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({ linkedIds: [CHANNEL_ID] }),
      configs: new Map([[CHANNEL_ID, { bot_token: "t", chat_id: "123" }]]),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result).toEqual({ sent: 1, failed: 0, errors: [] });
    expect(sent).toHaveLength(1);
  });

  it("refuses a monitor that belongs to somebody else", async () => {
    // The monitor id comes from the check that found it; a mismatch means
    // the caller is trying to notify for a monitor it does not own.
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({ ownerId: "somebody-else" }),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result).toEqual({
      sent: 0,
      failed: 1,
      errors: ["Monitor ownership mismatch"],
    });
    expect(sent).toHaveLength(0);
  });

  it("reports a monitor that is not there", async () => {
    const deps = dependencies({ store: fakeStore({ ownerId: null }) });
    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result).toEqual({
      sent: 0,
      failed: 1,
      errors: ["Monitor not found"],
    });
  });

  it("falls back to the default channel when none is linked", async () => {
    const sent: Sent[] = [];
    const store = fakeStore({ linkedIds: [] });
    const deps = dependencies({
      store,
      configs: new Map([[CHANNEL_ID, { bot_token: "t", chat_id: "123" }]]),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("does not send when the channel has no stored credential", async () => {
    // A channel with no credential is a channel that fails silently, so it
    // is reported as a failure rather than skipped.
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({ linkedIds: [CHANNEL_ID] }),
      configs: new Map(),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("No stored credentials");
    expect(sent).toHaveLength(0);
  });

  it("stops at the deadline", async () => {
    // A check that has run out of time must not start another delivery.
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({
        linkedIds: [CHANNEL_ID],
        channels: [channel(), channel({ id: "other", name: "Second" })],
      }),
      configs: new Map([
        [CHANNEL_ID, { bot_token: "t", chat_id: "123" }],
        ["other", { bot_token: "t", chat_id: "123" }],
      ]),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      Date.now() - 1,
      deps,
    );

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors).toContain("Notification deadline exceeded");
    expect(sent).toHaveLength(0);
  });

  it("caps the fan-out", async () => {
    // Twenty channels is the ceiling; a monitor linked to more does not
    // turn into twenty deliveries.
    const many = Array.from({ length: 30 }, (_, index) =>
      channel({ id: `channel-${index}`, name: `Channel ${index}` }),
    );
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({ linkedIds: many.map((c) => c.id), channels: many }),
      configs: new Map(
        many.map((c) => [c.id, { bot_token: "t", chat_id: "123" }]),
      ),
      sent,
    });

    const result = await notifyMonitor(
      MONITOR_ID,
      USER_ID,
      payload,
      undefined,
      deps,
    );

    expect(result.sent).toBe(20);
    expect(sent).toHaveLength(20);
  });
});

describe("notifyUser", () => {
  it("sends to every active channel", async () => {
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore({
        allChannels: [channel(), channel({ id: "second", name: "Second" })],
      }),
      configs: new Map([
        [CHANNEL_ID, { bot_token: "t", chat_id: "123" }],
        ["second", { bot_token: "t", chat_id: "123" }],
      ]),
      sent,
    });

    const result = await notifyUser(USER_ID, payload, deps);

    expect(result).toEqual({ sent: 2, failed: 0, errors: [] });
    expect(sent).toHaveLength(2);
  });

  it("reports a channel with no stored credential", async () => {
    const sent: Sent[] = [];
    const deps = dependencies({
      store: fakeStore(),
      configs: new Map(),
      sent,
    });

    const result = await notifyUser(USER_ID, payload, deps);

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("No stored credentials");
    expect(sent).toHaveLength(0);
  });
});
