import { z } from "zod";
import type { Json } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  mergeChannelConfig,
  notificationTypes,
  splitChannelConfig,
  type NotificationConfig,
  type NotificationType,
} from "@/lib/notification-types";

/**
 * Server-side access to notification channels.
 *
 * Every credential lives in `vault.secrets`; `notification_channels.config`
 * holds only non-sensitive settings, and the database refuses to store a
 * credential there (see the CHECK constraint in
 * 20260927094500_add_vault_notification_secrets.sql). Nothing in this module
 * ever returns a secret to a client component or an API response.
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

/** A channel as the UI is allowed to see it: no credential, only a flag. */
export type ChannelView = Omit<ChannelRow, "secret_id"> & {
  hasSecret: boolean;
};

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

const telegramConfigSchema = z.object({
  bot_token: z.string().min(1, "Bot token is required"),
  chat_id: z.string().min(1, "Chat ID is required"),
});

const webhookConfigSchema = z.object({
  url: z.string().url("Invalid webhook URL"),
  method: z.enum(["GET", "POST"]).optional().default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
});

const webhookUrlOnlySchema = z.object({
  webhook_url: z.string().url("Invalid webhook URL"),
});

const pushoverConfigSchema = z.object({
  user_key: z.string().min(1, "User key is required"),
  token: z.string().min(1, "API token is required"),
  priority: z.number().min(-2).max(2).optional(),
  sound: z.string().optional(),
});

const emailConfigSchema = z.object({
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z
    .number()
    .min(1)
    .max(65535, "SMTP port must be between 1 and 65535"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  to: z.string().email("Invalid email address"),
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
    ...(config ?? {}),
    ...(secret ?? {}),
  });

  const merged = {
    ...split.config,
    ...(existingSecret ?? {}),
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
): Promise<ChannelWriteResult> {
  const supabase = await createClient();
  const partitioned = partition(input.type, input.config, input.secret, null);

  if (!partitioned.ok) {
    return { ok: false, error: partitioned.error, status: 400 };
  }

  const { data, error } = await supabase
    .from("notification_channels")
    .insert({
      user_id: userId,
      name: input.name,
      type: input.type,
      config: partitioned.config,
      active: true,
    } as never)
    .select("id, user_id, name, type, config, secret_id, is_default, active")
    .single();

  if (error || !data) {
    console.error("Error creating channel:", error);
    return {
      ok: false,
      error: "Failed to create notification channel",
      status: 500,
    };
  }

  const row = data as unknown as ChannelRow;
  let storedSecret = false;

  if (Object.keys(partitioned.secret).length > 0) {
    const { error: secretError } = await supabase.rpc(
      "notification_channel_set_secret",
      { p_channel_id: row.id, p_secret: partitioned.secret as Json },
    );

    if (secretError) {
      // Do not leave a half-configured channel behind: a channel with no
      // credential is worse than no channel, because it fails silently.
      await supabase
        .from("notification_channels")
        .delete()
        .eq("id", row.id)
        .eq("user_id", userId);
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
): Promise<ChannelWriteResult> {
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("notification_channels")
    .select("id, type, config, secret_id")
    .eq("id", input.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    console.error("Error reading channel:", readError);
    return { ok: false, error: "Failed to load channel", status: 500 };
  }

  if (!existing) {
    return { ok: false, error: "Channel not found", status: 404 };
  }

  const type = (existing as { type: NotificationType }).type;
  const currentConfig =
    (existing as { config: Record<string, unknown> }).config ?? {};
  const hasSecret =
    (existing as { secret_id: string | null }).secret_id !== null;

  // Only a stored secret can satisfy an omitted field. A channel that has
  // never had one must supply its credentials again.
  const existingSecret = hasSecret ? await readChannelSecret(input.id) : null;

  const partitioned = partition(
    type,
    input.config ?? currentConfig,
    input.secret,
    existingSecret,
  );

  if (!partitioned.ok) {
    return { ok: false, error: partitioned.error, status: 400 };
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.active !== undefined) patch.active = input.active;
  if (input.is_default !== undefined) patch.is_default = input.is_default;
  if (input.config !== undefined) patch.config = partitioned.config;

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await supabase
      .from("notification_channels")
      .update(patch as never)
      .eq("id", input.id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating channel:", updateError);
      return { ok: false, error: "Failed to update channel", status: 500 };
    }
  }

  if (Object.keys(partitioned.secret).length > 0) {
    const { error: secretError } = await supabase.rpc(
      "notification_channel_set_secret",
      { p_channel_id: input.id, p_secret: partitioned.secret as Json },
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
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const supabase = await createClient();
  // The `delete_notification_channel_secret` trigger removes the vault row.
  const { error } = await supabase
    .from("notification_channels")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting channel:", error);
    return { ok: false, error: "Failed to delete channel", status: 500 };
  }

  return { ok: true };
}

async function readChannelSecret(
  channelId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notification_channel_secret", {
    p_channel_id: channelId,
  });

  if (error) {
    console.error("Error reading channel secret:", error);
    return null;
  }

  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Resolves the full config a sender needs for a set of channels, in one
 * round trip. Service-role only: delivery runs from cron.
 */
export async function resolveChannelConfigs<
  T extends { id: string; type: NotificationType; config: unknown },
>(channels: T[]): Promise<Map<string, NotificationConfig>> {
  const resolved = new Map<string, NotificationConfig>();
  if (channels.length === 0) return resolved;

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("notification_channel_secrets", {
    p_channel_ids: channels.map((channel) => channel.id),
  });

  if (error) {
    console.error("Error resolving channel secrets:", error);
    return resolved;
  }

  const secrets = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as {
    out_channel_id: string;
    out_secret: Record<string, unknown>;
  }[]) {
    secrets.set(row.out_channel_id, row.out_secret ?? {});
  }

  for (const channel of channels) {
    resolved.set(
      channel.id,
      mergeChannelConfig(
        (channel.config ?? {}) as Record<string, unknown>,
        secrets.get(channel.id) ?? null,
      ) as unknown as NotificationConfig,
    );
  }

  return resolved;
}
