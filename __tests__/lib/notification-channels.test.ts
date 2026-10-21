import { describe, expect, it } from "bun:test";

import {
  channelIdSchema,
  type ChannelPatch,
  type ChannelStore,
  createChannel,
  createChannelSchema,
  deleteChannel,
  resolveChannelConfigs,
  updateChannel,
  updateChannelSchema,
} from "@/lib/notification-channels";

/**
 * The channel store is the code that holds notification credentials, so
 * these tests are about one thing above all: a credential must never reach
 * the `config` column, and it must never come back out.
 *
 * The store is a port, so the fake below is a plain object. Nothing here
 * mocks a module — `mock.module` in Bun is process-wide, and a test that
 * replaced one would silently change what every other test file sees.
 */

const USER_ID = "user-1";
const CHANNEL_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

type FakeStore = ChannelStore & {
  /** Every insert, in order. */
  inserts: Array<{
    userId: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  /** Every patch, in order. */
  updates: Array<{ id: string; userId: string; patch: ChannelPatch }>;
  /** Every vault write, in order. */
  secrets: Array<{ channelId: string; secret: Record<string, unknown> }>;
  /** Every delete, in order. */
  removes: string[];
  /** The batched secret reads, in order. */
  batches: string[][];
};

function fakeStore(
  overrides: Partial<{
    row: Record<string, unknown> | null;
    readError: string | null;
    insertError: string | null;
    updateError: string | null;
    removeError: string | null;
    setSecretError: string | null;
    readSecret: Record<string, unknown> | null;
    readSecretError: string | null;
    secrets: Record<string, Record<string, unknown>>;
    readSecretsError: string | null;
  }> = {},
): FakeStore {
  const store: FakeStore = {
    inserts: [],
    updates: [],
    secrets: [],
    removes: [],
    batches: [],

    async insert(input) {
      store.inserts.push(input);
      if (overrides.insertError) {
        return { row: null, error: overrides.insertError };
      }
      return {
        row: (overrides.row ?? {
          id: CHANNEL_ID,
          user_id: USER_ID,
          name: input.name,
          type: input.type,
          config: input.config,
          secret_id: null,
          is_default: false,
          active: true,
        }) as never,
        error: null,
      };
    },

    async read() {
      if (overrides.readError) return { row: null, error: overrides.readError };
      // `row: null` means "there is no such channel", which is different
      // from "not overridden".
      const row =
        "row" in overrides
          ? overrides.row
          : {
              id: CHANNEL_ID,
              type: "telegram",
              config: { chat_id: "123" },
              secret_id: "secret-1",
            };
      return { row: row as never, error: null };
    },

    async update(id, userId, patch) {
      store.updates.push({ id, userId, patch });
      return { error: overrides.updateError ?? null };
    },

    async remove(id) {
      store.removes.push(id);
      return { error: overrides.removeError ?? null };
    },

    async setSecret(channelId, secret) {
      store.secrets.push({ channelId, secret });
      return { error: overrides.setSecretError ?? null };
    },

    async readSecret() {
      if (overrides.readSecretError) {
        return { secret: null, error: overrides.readSecretError };
      }
      return {
        secret: overrides.readSecret ?? { bot_token: "stored-token" },
        error: null,
      };
    },

    async readSecrets(channelIds) {
      store.batches.push(channelIds);
      if (overrides.readSecretsError) {
        return { secrets: [], error: overrides.readSecretsError };
      }
      return {
        secrets: Object.entries(overrides.secrets ?? {}).map(
          ([channelId, secret]) => ({ channelId, secret }),
        ),
        error: null,
      };
    },
  };

  return store;
}

describe("createChannel", () => {
  it("keeps a credential out of the config column", async () => {
    // The database refuses a credential in `config`, and the split is what
    // makes that true: the credential goes to the vault, the settings stay.
    const store = fakeStore();
    const result = await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123" },
        secret: { bot_token: "telegram-secret" },
      },
      store,
    );

    expect(result.ok).toBe(true);
    expect(store.inserts[0]?.config).toEqual({ chat_id: "123" });
    expect(JSON.stringify(store.inserts[0]?.config)).not.toContain(
      "telegram-secret",
    );
    expect(store.secrets).toEqual([
      { channelId: CHANNEL_ID, secret: { bot_token: "telegram-secret" } },
    ]);
  });

  it("takes a credential that was sent under config as well", async () => {
    // The legacy shape: the client puts everything in `config`. The split
    // still has to move the credential out.
    const store = fakeStore();
    await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123", bot_token: "telegram-secret" },
      },
      store,
    );

    expect(store.inserts[0]?.config).toEqual({ chat_id: "123" });
    expect(store.secrets[0]?.secret).toEqual({ bot_token: "telegram-secret" });
  });

  it("never returns a credential to the caller", async () => {
    const store = fakeStore();
    const result = await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123" },
        secret: { bot_token: "telegram-secret" },
      },
      store,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.channel.hasSecret).toBe(true);
    expect(JSON.stringify(result.channel)).not.toContain("telegram-secret");
  });

  it("removes the channel when the credential cannot be stored", async () => {
    // A channel with no credential is worse than no channel: it fails
    // silently, so the half-configured row is taken back out.
    const store = fakeStore({ setSecretError: "vault is closed" });
    const result = await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123" },
        secret: { bot_token: "telegram-secret" },
      },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Failed to store notification credentials",
      status: 500,
    });
    expect(store.removes).toEqual([CHANNEL_ID]);
  });

  it("rejects a configuration that does not validate", async () => {
    // A telegram channel with no bot token is not a telegram channel, and
    // the message says which field is missing.
    const store = fakeStore();
    const result = await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123" },
        secret: { bot_token: "" },
      },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Bot token is required",
      status: 400,
    });
    expect(store.inserts).toHaveLength(0);
  });

  it("reports a failed insert", async () => {
    const store = fakeStore({ insertError: "row level security" });
    const result = await createChannel(
      USER_ID,
      {
        name: "Ops",
        type: "telegram",
        config: { chat_id: "123" },
        secret: { bot_token: "telegram-secret" },
      },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Failed to create notification channel",
      status: 500,
    });
  });
});

describe("updateChannel", () => {
  it("keeps a stored credential when the request omits it", async () => {
    // Partial by design: an omitted key means "keep what is stored".
    const store = fakeStore({ readSecret: { bot_token: "stored-token" } });
    const result = await updateChannel(
      USER_ID,
      { id: CHANNEL_ID, name: "Renamed" },
      store,
    );

    expect(result.ok).toBe(true);
    // The stored credential satisfied the validation, and nothing was
    // written back to the vault.
    expect(store.secrets).toHaveLength(0);
    expect(store.updates[0]?.patch).toEqual({ name: "Renamed" });
  });

  it("asks for the credentials again when there are none stored", async () => {
    // A channel that has never had a credential cannot be validated
    // against one, so the request has to supply it.
    const store = fakeStore({
      row: {
        id: CHANNEL_ID,
        type: "telegram",
        config: { chat_id: "123" },
        secret_id: null,
      },
    });
    const result = await updateChannel(
      USER_ID,
      { id: CHANNEL_ID, name: "Renamed" },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Bot token is required",
      status: 400,
    });
  });

  it("rotates the credential when one is supplied", async () => {
    const store = fakeStore({ readSecret: { bot_token: "stored-token" } });
    const result = await updateChannel(
      USER_ID,
      { id: CHANNEL_ID, secret: { bot_token: "new-token" } },
      store,
    );

    expect(result.ok).toBe(true);
    expect(store.secrets).toEqual([
      { channelId: CHANNEL_ID, secret: { bot_token: "new-token" } },
    ]);
    if (!result.ok) return;
    expect(result.channel.hasSecret).toBe(true);
  });

  it("reports a channel that is not there", async () => {
    const store = fakeStore({ row: null });
    const result = await updateChannel(USER_ID, { id: CHANNEL_ID }, store);

    expect(result).toEqual({
      ok: false,
      error: "Channel not found",
      status: 404,
    });
  });

  it("reports a failed read", async () => {
    const store = fakeStore({ readError: "connection reset" });
    const result = await updateChannel(USER_ID, { id: CHANNEL_ID }, store);

    expect(result).toEqual({
      ok: false,
      error: "Failed to load channel",
      status: 500,
    });
  });

  it("reports a failed update", async () => {
    const store = fakeStore({ updateError: "row level security" });
    const result = await updateChannel(
      USER_ID,
      { id: CHANNEL_ID, name: "Renamed" },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Failed to update channel",
      status: 500,
    });
  });

  it("reports a credential that could not be rotated", async () => {
    const store = fakeStore({
      readSecret: { bot_token: "stored-token" },
      setSecretError: "vault is closed",
    });
    const result = await updateChannel(
      USER_ID,
      { id: CHANNEL_ID, secret: { bot_token: "new-token" } },
      store,
    );

    expect(result).toEqual({
      ok: false,
      error: "Failed to store notification credentials",
      status: 500,
    });
  });
});

describe("deleteChannel", () => {
  it("deletes the channel", async () => {
    const store = fakeStore();
    const result = await deleteChannel(USER_ID, CHANNEL_ID, store);

    expect(result).toEqual({ ok: true });
    expect(store.removes).toEqual([CHANNEL_ID]);
  });

  it("reports a failed delete", async () => {
    const store = fakeStore({ removeError: "row level security" });
    const result = await deleteChannel(USER_ID, CHANNEL_ID, store);

    expect(result).toEqual({
      ok: false,
      error: "Failed to delete channel",
      status: 500,
    });
  });
});

describe("resolveChannelConfigs", () => {
  it("merges the stored settings with the credential", async () => {
    const store = fakeStore({
      secrets: { [CHANNEL_ID]: { bot_token: "telegram-secret" } },
    });
    const resolved = await resolveChannelConfigs(
      [{ id: CHANNEL_ID, type: "telegram", config: { chat_id: "123" } }],
      store,
    );

    expect(resolved.get(CHANNEL_ID)).toEqual({
      chat_id: "123",
      bot_token: "telegram-secret",
    });
  });

  it("reads the whole batch in one round trip", async () => {
    const store = fakeStore();
    await resolveChannelConfigs(
      [
        { id: "a", type: "telegram", config: {} },
        { id: "b", type: "telegram", config: {} },
      ],
      store,
    );

    expect(store.batches).toEqual([["a", "b"]]);
  });

  it("returns nothing when the credential read fails", async () => {
    // A failed read must not be a channel with no credential: the caller
    // checks for a missing config and refuses to send.
    const store = fakeStore({ readSecretsError: "vault is closed" });
    const resolved = await resolveChannelConfigs(
      [{ id: CHANNEL_ID, type: "telegram", config: { chat_id: "123" } }],
      store,
    );

    expect(resolved.size).toBe(0);
  });

  it("does not read at all when there is nothing to resolve", async () => {
    const store = fakeStore();
    const resolved = await resolveChannelConfigs([], store);

    expect(resolved.size).toBe(0);
    expect(store.batches).toHaveLength(0);
  });
});

describe("channel schemas", () => {
  it("accepts a channel id that is a uuid", () => {
    expect(channelIdSchema.safeParse(CHANNEL_ID).success).toBe(true);
  });

  it("rejects a channel id that is not", () => {
    expect(channelIdSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("requires a name and a known type", () => {
    const parsed = createChannelSchema.safeParse({
      name: "",
      type: "carrier-pigeon",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a channel with only a name and a type", () => {
    expect(
      createChannelSchema.safeParse({ name: "Ops", type: "webhook" }).success,
    ).toBe(true);
  });

  it("requires a uuid on an update", () => {
    expect(updateChannelSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(updateChannelSchema.safeParse({ id: CHANNEL_ID }).success).toBe(
      true,
    );
  });
});
