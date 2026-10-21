import { describe, expect, it } from "bun:test";

import {
  type ChannelClients,
  createSupabaseStore,
} from "@/lib/notification-channels";

import { fakeClient } from "./fake-supabase";

/**
 * The Supabase adapter.
 *
 * The port above it says *what* the module needs from the database. This
 * says *how* it asks for it — and "how" is where the mistakes that matter
 * live: a query that forgets to filter by the owner, a credential written
 * to the wrong column, a batch read that goes through the user's client
 * instead of the service role.
 */

const CHANNEL_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const USER_ID = "user-1";

function clients(
  user: ReturnType<typeof fakeClient>,
  service: ReturnType<typeof fakeClient>,
): ChannelClients {
  return {
    user: async () => user.client,
    service: () => service.client,
  };
}

describe("the channel store", () => {
  it("writes only the non-sensitive settings to the channel row", async () => {
    // The database refuses a credential in `config`; this is the query
    // that has to honour that.
    const user = fakeClient({
      notification_channels: {
        data: {
          id: CHANNEL_ID,
          user_id: USER_ID,
          name: "Ops",
          type: "telegram",
          config: { chat_id: "123" },
          secret_id: null,
          is_default: false,
          active: true,
        },
      },
    });
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    await store.insert({
      userId: USER_ID,
      name: "Ops",
      type: "telegram",
      config: { chat_id: "123" },
    });

    expect(user.one("insert")?.payload).toEqual({
      user_id: USER_ID,
      name: "Ops",
      type: "telegram",
      config: { chat_id: "123" },
      active: true,
    });
  });

  it("stores a credential through the owner-checked vault function", async () => {
    const user = fakeClient();
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    await store.setSecret(CHANNEL_ID, { bot_token: "telegram-secret" });

    expect(user.rpcs).toEqual([
      {
        name: "notification_channel_set_secret",
        args: {
          p_channel_id: CHANNEL_ID,
          p_secret: { bot_token: "telegram-secret" },
        },
      },
    ]);
    // The service-role client is for delivery, not for writing.
    expect(service.rpcs).toEqual([]);
  });

  it("reads one credential through the owner's client", async () => {
    // The RPC is `SECURITY DEFINER` with an owner check, so it has to be
    // the caller's own client that asks.
    const user = fakeClient({
      notification_channel_secret: { data: { bot_token: "telegram-secret" } },
    });
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    const result = await store.readSecret(CHANNEL_ID);

    expect(result.secret).toEqual({ bot_token: "telegram-secret" });
    expect(user.rpcs[0]?.name).toBe("notification_channel_secret");
    expect(service.rpcs).toEqual([]);
  });

  it("reads a batch of credentials through the service-role client", async () => {
    // Delivery runs from cron, where there is no user session to be the
    // owner. Reading the batch with the user's client would find nothing.
    const user = fakeClient();
    const service = fakeClient({
      notification_channel_secrets: {
        data: [{ out_channel_id: CHANNEL_ID, out_secret: { bot_token: "s" } }],
      },
    });
    const store = createSupabaseStore(clients(user, service));

    const result = await store.readSecrets([CHANNEL_ID]);

    expect(result.secrets).toEqual([
      { channelId: CHANNEL_ID, secret: { bot_token: "s" } },
    ]);
    expect(service.rpcs[0]?.name).toBe("notification_channel_secrets");
    expect(user.rpcs).toEqual([]);
  });

  it("scopes a read to the owner", async () => {
    // Without the owner filter, one tenant could read another's channel.
    const user = fakeClient();
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    await store.read(CHANNEL_ID, USER_ID);

    expect(user.one("select")?.filters).toEqual([
      ["id", CHANNEL_ID],
      ["user_id", USER_ID],
    ]);
  });

  it("scopes an update to the owner", async () => {
    const user = fakeClient();
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    await store.update(CHANNEL_ID, USER_ID, { name: "Renamed" });

    const update = user.one("update");
    expect(update?.payload).toEqual({ name: "Renamed" });
    expect(update?.filters).toEqual([
      ["id", CHANNEL_ID],
      ["user_id", USER_ID],
    ]);
  });

  it("scopes a delete to the owner", async () => {
    const user = fakeClient();
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    await store.remove(CHANNEL_ID, USER_ID);

    expect(user.one("delete")?.filters).toEqual([
      ["id", CHANNEL_ID],
      ["user_id", USER_ID],
    ]);
  });

  it("reports an error from the database", async () => {
    const user = fakeClient({
      notification_channels: { error: { message: "row level security" } },
    });
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    const result = await store.read(CHANNEL_ID, USER_ID);

    expect(result).toEqual({ row: null, error: "row level security" });
  });

  it("reports an error from a credential read", async () => {
    const user = fakeClient({
      notification_channel_secret: { error: { message: "vault is closed" } },
    });
    const service = fakeClient();
    const store = createSupabaseStore(clients(user, service));

    const result = await store.readSecret(CHANNEL_ID);

    expect(result).toEqual({ secret: null, error: "vault is closed" });
  });
});
