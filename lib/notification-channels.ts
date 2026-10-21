import { z } from "zod";

import {
  mergeChannelConfig,
  type NotificationConfig,
  type NotificationType,
  notificationTypes,
  splitChannelConfig,
} from "@/lib/notification-types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

/**
 * Server-side access to notification channels.
 *
 * Every credential lives in `vault.secrets`; `notification_channels.config`
 * holds only non-sensitive settings, and the database refuses to store a
 * credential there (see the CHECK constraint in
 * 20260927094500_add_vault_notification_secrets.sql). Nothing in this module
 * ever returns a secret to a client component or an API response.
 *
 * The database is reached through {@link ChannelStore}, a narrow port. The
 * port is the module's contract with the database, written down: a test can
 * supply a fake without mocking a module, and `mock.module` in Bun is
 * process-wide, so a test that replaced one would silently change what every
 * other test file sees.
 */

type ChannelRow = {
  id: string;
  user_id: string;
  name: string;
  type: NotificationType;
  config: Record<string, unknown>;
  secret_id: string | null;
  is_default: boolean;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

/** The channel fields the module reads back. */
type StoredChannel = {
  id: string;
  type: NotificationType;
  config: Record<string, unknown>;
  secret_id: string | null;
};

/** A channel as the UI is allowed to see it: no credential, only a flag. */
export type ChannelView = Omit<ChannelRow, "secret_id"> & {
  hasSecret: boolean;
};

/** The channel fields a write may change. */
export type ChannelPatch = {
  name?: string;
  active?: boolean;
  is_default?: boolean;
  config?: Record<string, unknown>;
};

/**
 * The database operations this module needs.
 *
 * Every method resolves to a plain result: the row it read, or the message
 * of the error it hit. Nothing about Supabase leaks past the port, so the
 * module above it is ordinary code.
 */
export type ChannelStore = {
  insert(input: {
    userId: string;
    name: string;
    type: NotificationType;
    config: Record<string, unknown>;
  }): Promise<{ row: ChannelRow | null; error: string | null }>;

  read(
    id: string,
    userId: string,
  ): Promise<{ row: StoredChannel | null; error: string | null }>;

  update(
    id: string,
    userId: string,
    patch: ChannelPatch,
  ): Promise<{ error: string | null }>;

  remove(id: string, userId: string): Promise<{ error: string | null }>;

  /** Store a credential in the vault, for one channel. */
  setSecret(
    channelId: string,
    secret: Record<string, unknown>,
  ): Promise<{ error: string | null }>;

  /** Read one credential. Service-role only. */
  readSecret(
    channelId: string,
  ): Promise<{ secret: Record<string, unknown> | null; error: string | null }>;

  /** Read a batch of credentials, in one round trip. Service-role only. */
  readSecrets(channelIds: string[]): Promise<{
    secrets: Array<{ channelId: string; secret: Record<string, unknown> }>;
    error: string | null;
  }>;
};

/**
 * The real store: Supabase, through the owner-checked vault functions.
 *
 * The user-scoped client is used for the channel row, and the service-role
 * client for the credentials — a credential is only ever read by a process
 * that is allowed to send the notification.
 */
function createSupabaseStore(): ChannelStore {
  return {
    async insert(input) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("notification_channels")
        .insert({
          user_id: input.userId,
          name: input.name,
          type: input.type,
          // The column is JSON; the config is a record of settings that the
          // schema has already checked.
          config: input.config as Json,
          active: true,
        })
        .select(
          "id, user_id, name, type, config, secret_id, is_default, active",
        )
        .single();

      return {
        row: (data as unknown as ChannelRow) ?? null,
        error: error?.message ?? null,
      };
    },

    async read(id, userId) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("notification_channels")
        .select("id, type, config, secret_id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        return { row: null, error: error.message };
      }
      return {
        row: (data as unknown as StoredChannel) ?? null,
        error: null,
      };
    },

    async update(id, userId, patch) {
      const supabase = await createClient();
      // Built field by field rather than spread: the spread would widen
      // `config` past the column's JSON type.
      const update: {
        name?: string;
        active?: boolean;
        is_default?: boolean;
        config?: Json;
      } = {};
      if (patch.name !== undefined) update.name = patch.name;
      if (patch.active !== undefined) update.active = patch.active;
      if (patch.is_default !== undefined) update.is_default = patch.is_default;
      if (patch.config !== undefined) update.config = patch.config as Json;

      const { error } = await supabase
        .from("notification_channels")
        .update(update)
        .eq("id", id)
        .eq("user_id", userId);

      return { error: error?.message ?? null };
    },

    async remove(id, userId) {
      const supabase = await createClient();
      const { error } = await supabase
        .from("notification_channels")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);

      return { error: error?.message ?? null };
    },

    async setSecret(channelId, secret) {
      const supabase = await createClient();
      const { error } = await supabase.rpc("notification_channel_set_secret", {
        p_channel_id: channelId,
        p_secret: secret as Json,
      });

      return { error: error?.message ?? null };
    },

    async readSecret(channelId) {
      // The user-scoped client, because the RPC is `SECURITY DEFINER` with
      // an owner check: it is the caller's own channel that is readable.
      const supabase = await createClient();
      const { data, error } = await supabase.rpc(
        "notification_channel_secret",
        {
          p_channel_id: channelId,
        },
      );

      if (error) {
        return { secret: null, error: error.message };
      }
      return {
        secret: (data as Record<string, unknown> | null) ?? null,
        error: null,
      };
    },

    async readSecrets(channelIds) {
      // The service-role client is synchronous: it has no session to read.
      const supabase = createServiceClient();
      const { data, error } = await supabase.rpc(
        "notification_channel_secrets",
        {
          p_channel_ids: channelIds,
        },
      );

      if (error) {
        return { secrets: [], error: error.message };
      }
      return {
        secrets: (
          (data ?? []) as {
            out_channel_id: string;
            out_secret: Record<string, unknown>;
          }[]
        ).map((row) => ({
          channelId: row.out_channel_id,
          secret: row.out_secret ?? {},
        })),
        error: null,
      };
    },
  };
}

/**
 * The store every call uses unless a test supplies its own.
 *
 * It is created once, not per call: the store's methods reach for a client
 * when they are called, so there is no connection to open here.
 */
const DEFAULT_STORE: ChannelStore = createSupabaseStore();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const channelIdSchema = z
  .string()
  .regex(UUID_RE, "Valid channel ID required");

const channelNameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name must be less than 100 characters")
  .trim();

const channelTypeSchema = z.enum(notificationTypes);

const rawRecord = z.record(z.string(), z.unknown());

// The `error` on each field is what a user sees when a field is *missing*.
// Without it, Zod reports "expected string, received undefined", which says
// nothing about which field was left out.

const telegramConfigSchema = z.object({
  bot_token: z
    .string({ error: "Bot token is required" })
    .min(1, "Bot token is required"),
  chat_id: z
    .string({ error: "Chat ID is required" })
    .min(1, "Chat ID is required"),
});

const webhookConfigSchema = z.object({
  url: z
    .string({ error: "Webhook URL is required" })
    .url("Invalid webhook URL"),
  method: z.enum(["GET", "POST"]).optional().default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
});

const webhookUrlOnlySchema = z.object({
  webhook_url: z
    .string({ error: "Webhook URL is required" })
    .url("Invalid webhook URL"),
});

const pushoverConfigSchema = z.object({
  user_key: z
    .string({ error: "User key is required" })
    .min(1, "User key is required"),
  token: z
    .string({ error: "API token is required" })
    .min(1, "API token is required"),
  priority: z.number().min(-2).max(2).optional(),
  sound: z.string().optional(),
});

const emailConfigSchema = z.object({
  smtp_host: z
    .string({ error: "SMTP host is required" })
    .min(1, "SMTP host is required"),
  smtp_port: z
    .number({ error: "SMTP port is required" })
    .min(1)
    .max(65535, "SMTP port must be between 1 and 65535"),
  username: z
    .string({ error: "Username is required" })
    .min(1, "Username is required"),
  password: z
    .string({ error: "Password is required" })
    .min(1, "Password is required"),
  to: z
    .string({ error: "Email address is required" })
    .email("Invalid email address"),
});

function configSchemaFor(type: NotificationType): z.ZodType {
  switch (type) {
    case "telegram":
      return telegramConfigSchema;
    case "discord":
    case "slack":
    case "teams":
      return webhookUrlOnlySchema;
    case "webhook":
      return webhookConfigSchema;
    case "pushover":
      return pushoverConfigSchema;
    case "email":
      return emailConfigSchema;
    default:
      return rawRecord;
  }
}

export const createChannelSchema = z.object({
  name: channelNameSchema,
  type: channelTypeSchema,
  // Clients may send the credential under `config` (legacy) or under
  // `secret`. Either way it is split here, so nothing sensitive can reach
  // the `config` column.
  config: rawRecord.optional(),
  secret: rawRecord.optional(),
});

export const updateChannelSchema = z.object({
  id: channelIdSchema,
  name: channelNameSchema.optional(),
  active: z.boolean().optional(),
  is_default: z.boolean().optional(),
  config: rawRecord.optional(),
  // Partial by design: an omitted key means "keep the stored credential".
  secret: rawRecord.optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;

export type ChannelWriteResult =
  | { ok: true; channel: ChannelView }
  | { ok: false; error: string; status: number };

function toView(row: ChannelRow, hasSecret?: boolean): ChannelView {
  const { secret_id: secretId, ...rest } = row;
  return { ...rest, hasSecret: hasSecret ?? secretId !== null };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message || "Invalid configuration";
}

/**
 * Normalises a submitted config into the halves that get persisted, then
 * validates the *merged* result so validation covers credentials held in
 * the vault as well as anything in this request.
 */
function partition(
  type: NotificationType,
  config: Record<string, unknown> | undefined,
  secret: Record<string, unknown> | undefined,
  existingSecret: Record<string, unknown> | null,
) {
  const split = splitChannelConfig(type, {
    ...config,
    ...secret,
  });

  const merged = {
    ...split.config,
    ...existingSecret,
    ...split.secret,
  };

  const parsed = configSchemaFor(type).safeParse(merged);
  if (!parsed.success) {
    return { ok: false as const, error: firstIssue(parsed.error) };
  }

  return { ok: true as const, config: split.config, secret: split.secret };
}

export async function createChannel(
  userId: string,
  input: CreateChannelInput,
  store: ChannelStore = DEFAULT_STORE,
): Promise<ChannelWriteResult> {
  const partitioned = partition(input.type, input.config, input.secret, null);

  if (!partitioned.ok) {
    return { ok: false, error: partitioned.error, status: 400 };
  }

  const { row, error } = await store.insert({
    userId,
    name: input.name,
    type: input.type,
    config: partitioned.config,
  });

  if (error || !row) {
    console.error("Error creating channel:", error);
    return {
      ok: false,
      error: "Failed to create notification channel",
      status: 500,
    };
  }

  let storedSecret = false;

  if (Object.keys(partitioned.secret).length > 0) {
    const { error: secretError } = await store.setSecret(
      row.id,
      partitioned.secret,
    );

    if (secretError) {
      // Do not leave a half-configured channel behind: a channel with no
      // credential is worse than no channel, because it fails silently.
      await store.remove(row.id, userId);
      console.error("Error storing channel secret:", secretError);
      return {
        ok: false,
        error: "Failed to store notification credentials",
        status: 500,
      };
    }

    storedSecret = true;
  }

  return { ok: true, channel: toView(row, storedSecret) };
}

export async function updateChannel(
  userId: string,
  input: UpdateChannelInput,
  store: ChannelStore = DEFAULT_STORE,
): Promise<ChannelWriteResult> {
  const { row: existing, error: readError } = await store.read(
    input.id,
    userId,
  );

  if (readError) {
    console.error("Error reading channel:", readError);
    return { ok: false, error: "Failed to load channel", status: 500 };
  }

  if (!existing) {
    return { ok: false, error: "Channel not found", status: 404 };
  }

  const { type } = existing;
  const currentConfig = existing.config ?? {};
  const hasSecret = existing.secret_id !== null;

  // Only a stored secret can satisfy an omitted field. A channel that has
  // never had one must supply its credentials again.
  const existingSecret = hasSecret
    ? (await store.readSecret(input.id)).secret
    : null;

  const partitioned = partition(
    type,
    input.config ?? currentConfig,
    input.secret,
    existingSecret,
  );

  if (!partitioned.ok) {
    return { ok: false, error: partitioned.error, status: 400 };
  }

  const patch: ChannelPatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.active !== undefined) patch.active = input.active;
  if (input.is_default !== undefined) patch.is_default = input.is_default;
  if (input.config !== undefined) patch.config = partitioned.config;

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await store.update(input.id, userId, patch);

    if (updateError) {
      console.error("Error updating channel:", updateError);
      return { ok: false, error: "Failed to update channel", status: 500 };
    }
  }

  if (Object.keys(partitioned.secret).length > 0) {
    const { error: secretError } = await store.setSecret(
      input.id,
      partitioned.secret,
    );

    if (secretError) {
      console.error("Error rotating channel secret:", secretError);
      return {
        ok: false,
        error: "Failed to store notification credentials",
        status: 500,
      };
    }
  }

  return {
    ok: true,
    channel: {
      id: input.id,
      user_id: userId,
      name: input.name ?? "",
      type,
      config: partitioned.config,
      is_default: input.is_default ?? false,
      active: input.active ?? true,
      hasSecret: hasSecret || Object.keys(partitioned.secret).length > 0,
    },
  };
}

export async function deleteChannel(
  userId: string,
  id: string,
  store: ChannelStore = DEFAULT_STORE,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  // The `delete_notification_channel_secret` trigger removes the vault row.
  const { error } = await store.remove(id, userId);

  if (error) {
    console.error("Error deleting channel:", error);
    return { ok: false, error: "Failed to delete channel", status: 500 };
  }

  return { ok: true };
}

/**
 * Resolves the full config a sender needs for a set of channels, in one
 * round trip. Service-role only: delivery runs from cron.
 */
export async function resolveChannelConfigs<
  T extends { id: string; type: NotificationType; config: unknown },
>(
  channels: T[],
  store: ChannelStore = DEFAULT_STORE,
): Promise<Map<string, NotificationConfig>> {
  const resolved = new Map<string, NotificationConfig>();
  if (channels.length === 0) return resolved;

  const { secrets, error } = await store.readSecrets(
    channels.map((channel) => channel.id),
  );

  if (error) {
    console.error("Error resolving channel secrets:", error);
    return resolved;
  }

  const byChannel = new Map<string, Record<string, unknown>>();
  for (const row of secrets) {
    byChannel.set(row.channelId, row.secret ?? {});
  }

  for (const channel of channels) {
    resolved.set(
      channel.id,
      mergeChannelConfig(
        (channel.config ?? {}) as Record<string, unknown>,
        byChannel.get(channel.id) ?? null,
      ) as unknown as NotificationConfig,
    );
  }

  return resolved;
}
