import { describe, expect, it } from "bun:test";

import { createSupabaseStore } from "@/lib/notifications";

import { fakeClient } from "./fake-supabase";

/**
 * The notification store.
 *
 * Every query here is scoped to a user. A query that forgot the
 * `user_id` filter would let one tenant's notification channels reach
 * another tenant's monitor, and the filter is the only thing standing
 * between the two.
 */

const USER_ID = "user-1";
const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const CHANNEL_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("the notification store", () => {
  it("reads the owner of a monitor", async () => {
    const service = fakeClient({
      monitors: { data: { user_id: USER_ID } },
    });
    const store = createSupabaseStore(() => service.client);

    const result = await store.monitorOwner(MONITOR_ID);

    expect(result).toEqual({ userId: USER_ID, error: null });
    expect(service.one("select")?.filters).toEqual([["id", MONITOR_ID]]);
  });

  it("reports a monitor that is not there", async () => {
    const service = fakeClient();
    const store = createSupabaseStore(() => service.client);

    expect(await store.monitorOwner(MONITOR_ID)).toEqual({
      userId: null,
      error: null,
    });
  });

  it("reports an error reading the monitor", async () => {
    const service = fakeClient({
      monitors: { error: { message: "connection reset" } },
    });
    const store = createSupabaseStore(() => service.client);

    expect(await store.monitorOwner(MONITOR_ID)).toEqual({
      userId: null,
      error: "connection reset",
    });
  });

  it("reads the channels linked to a monitor", async () => {
    const service = fakeClient({
      monitor_notifications: { data: [{ channel_id: CHANNEL_ID }] },
    });
    const store = createSupabaseStore(() => service.client);

    const result = await store.linkedChannelIds(MONITOR_ID);

    expect(result.ids).toEqual([CHANNEL_ID]);
    expect(service.one("select")?.filters).toEqual([
      ["monitor_id", MONITOR_ID],
    ]);
  });

  it("scopes a channel lookup to the owner and to the active channels", async () => {
    // A channel that belongs to somebody else, or that has been switched
    // off, must not be notified.
    const service = fakeClient();
    const store = createSupabaseStore(() => service.client);

    await store.channelsByIds(USER_ID, [CHANNEL_ID]);

    expect(service.one("select")?.filters).toEqual([
      ["id", [CHANNEL_ID]],
      ["user_id", USER_ID],
      ["active", true],
    ]);
  });

  it("scopes the default channel to the owner and to the active channels", async () => {
    const service = fakeClient();
    const store = createSupabaseStore(() => service.client);

    await store.defaultChannels(USER_ID);

    expect(service.one("select")?.filters).toEqual([
      ["user_id", USER_ID],
      ["active", true],
      ["is_default", true],
    ]);
  });

  it("scopes every active channel to the owner", async () => {
    const service = fakeClient();
    const store = createSupabaseStore(() => service.client);

    await store.allActiveChannels(USER_ID);

    expect(service.one("select")?.filters).toEqual([
      ["user_id", USER_ID],
      ["active", true],
    ]);
  });

  it("reports an error reading the channels", async () => {
    const service = fakeClient({
      notification_channels: { error: { message: "row level security" } },
    });
    const store = createSupabaseStore(() => service.client);

    expect(await store.allActiveChannels(USER_ID)).toEqual({
      channels: [],
      error: "row level security",
    });
  });
});
