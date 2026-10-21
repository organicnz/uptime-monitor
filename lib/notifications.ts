import { track } from "@vercel/analytics/server";

import { resolveChannelConfigs } from "@/lib/notification-channels";
import type {
  NotificationConfig,
  NotificationType,
} from "@/lib/notification-types";
import { fetchWithSsrfProtection, resolveAndValidateUrl } from "@/lib/security";
import {
  createServiceClient,
  type ServiceClient,
} from "@/lib/supabase/service";

import {
  type NotificationPayload,
  type NotificationTransport,
  sendNotification as sendSharedNotification,
  type SendResult,
  withRetry,
} from "../supabase/functions/_shared/senders";

export type { NotificationPayload };
export type {
  DiscordConfig,
  EmailConfig,
  NotificationConfig,
  NotificationType,
  PushoverConfig,
  SlackConfig,
  TeamsConfig,
  TelegramConfig,
  WebhookConfig,
} from "@/lib/notification-types";

type NotificationChannel = {
  id: string;
  user_id: string;
  type: NotificationType;
  name: string;
  config: Record<string, unknown>;
  active: boolean;
};

/**
 * The rows this module reads.
 *
 * A narrow port, for the same reason as the channel store: `mock.module` in
 * Bun is process-wide, so a test that replaced one would silently change
 * what every other test file sees.
 */
export type NotificationStore = {
  /** The owner of a monitor. */
  monitorOwner(
    monitorId: string,
  ): Promise<{ userId: string | null; error: string | null }>;

  /** The channels linked to a monitor. */
  linkedChannelIds(
    monitorId: string,
  ): Promise<{ ids: string[]; error: string | null }>;

  /** The user's active channels, among a set of ids. */
  channelsByIds(
    userId: string,
    ids: string[],
  ): Promise<{ channels: NotificationChannel[]; error: string | null }>;

  /** The user's default active channel. */
  defaultChannels(
    userId: string,
  ): Promise<{ channels: NotificationChannel[]; error: string | null }>;

  /** Every active channel the user has. */
  allActiveChannels(
    userId: string,
  ): Promise<{ channels: NotificationChannel[]; error: string | null }>;
};

const CHANNEL_COLUMNS = "id, user_id, name, type, config, active";

export function createSupabaseStore(
  service: () => ServiceClient = () => createServiceClient(),
): NotificationStore {
  return {
    async monitorOwner(monitorId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("monitors")
        .select("user_id")
        .eq("id", monitorId)
        .maybeSingle();

      if (error) return { userId: null, error: error.message };
      return { userId: data?.user_id ?? null, error: null };
    },

    async linkedChannelIds(monitorId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("monitor_notifications")
        .select("channel_id")
        .eq("monitor_id", monitorId);

      if (error) return { ids: [], error: error.message };
      return {
        ids: (data ?? []).map((link) => link.channel_id),
        error: null,
      };
    },

    async channelsByIds(userId, ids) {
      const supabase = service();
      const { data, error } = await supabase
        .from("notification_channels")
        .select(CHANNEL_COLUMNS)
        .in("id", ids)
        .eq("user_id", userId)
        .eq("active", true);

      if (error) return { channels: [], error: error.message };
      return {
        channels: (data ?? []) as unknown as NotificationChannel[],
        error: null,
      };
    },

    async defaultChannels(userId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("notification_channels")
        .select(CHANNEL_COLUMNS)
        .eq("user_id", userId)
        .eq("active", true)
        .eq("is_default", true);

      if (error) return { channels: [], error: error.message };
      return {
        channels: (data ?? []) as unknown as NotificationChannel[],
        error: null,
      };
    },

    async allActiveChannels(userId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("notification_channels")
        .select(CHANNEL_COLUMNS)
        .eq("user_id", userId)
        .eq("active", true);

      if (error) return { channels: [], error: error.message };
      return {
        channels: (data ?? []) as unknown as NotificationChannel[],
        error: null,
      };
    },
  };
}

/**
 * Everything this module reaches for.
 *
 * The transport and the URL check are here because the difference between
 * them is the whole safety story: a fixed-vendor destination is contacted
 * directly, and a user-supplied one is filtered. A test that cannot tell
 * the two apart cannot test either.
 */
export type NotificationDependencies = {
  store: NotificationStore;
  /** Resolve the full config a sender needs, in one batch. */
  resolveConfigs: typeof resolveChannelConfigs;
  /** The plain transport, for a fixed-vendor destination. */
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** The SSRF-protected transport, for a user-supplied destination. */
  ssrfFetch: typeof fetchWithSsrfProtection;
  /** Validate a destination before it is contacted. */
  validateUrl: typeof resolveAndValidateUrl;
};

export const defaultNotificationDependencies: NotificationDependencies = {
  store: createSupabaseStore(),
  resolveConfigs: resolveChannelConfigs,
  fetch: (url, init) => fetch(url, init),
  ssrfFetch: fetchWithSsrfProtection,
  validateUrl: resolveAndValidateUrl,
};

/**
 * Fixed-vendor endpoints. Their host is part of the integration rather than
 * user input, so they skip the SSRF filter; every user-supplied destination
 * goes through the SSRF-protected transport.
 */
function senderFor(
  type: NotificationType,
  dependencies: NotificationDependencies,
): NotificationTransport {
  const transport =
    type === "telegram" || type === "pushover" || type === "email"
      ? dependencies.fetch
      : dependencies.ssrfFetch;
  return withRetry(transport);
}

function safeTrack(event: string, props?: Parameters<typeof track>[1]) {
  try {
    const result = track(event, props) as unknown as
      Promise<unknown> | undefined;
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    return;
  }
}

async function validateOutboundUrl(
  url: string,
  dependencies: NotificationDependencies,
): Promise<SendResult | null> {
  try {
    await dependencies.validateUrl(url);
    return null;
  } catch (error) {
    return {
      success: false,
      error: `URL blocked by SSRF filter: ${error instanceof Error ? error.message : "Invalid URL"}`,
    };
  }
}

/** Destination a channel's sender will contact, for pre-flight validation. */
function outboundUrlFor(
  type: NotificationType,
  config: NotificationConfig,
): string | null {
  if (type === "telegram" || type === "pushover" || type === "email")
    return null;
  if (type === "webhook") return (config as { url?: string }).url ?? null;
  if (type === "discord" || type === "slack" || type === "teams") {
    return (config as { webhook_url?: string }).webhook_url ?? null;
  }
  return null;
}

export async function sendNotification(
  type: NotificationType,
  config: NotificationConfig,
  payload: NotificationPayload,
  dependencies: NotificationDependencies = defaultNotificationDependencies,
): Promise<SendResult> {
  // Validate before sending so a blocked destination is reported as a
  // blocked destination rather than as a generic fetch failure.
  const url = outboundUrlFor(type, config);
  if (url) {
    const blocked = await validateOutboundUrl(url, dependencies);
    if (blocked) return blocked;
  }

  return sendSharedNotification(
    type,
    config as unknown as Record<string, unknown>,
    payload,
    senderFor(type, dependencies),
  );
}

type NotifyOutcome = { sent: number; failed: number; errors: string[] };

function summarise(
  results: Array<{ channel: string } & SendResult>,
  deadlineExceeded: boolean,
): NotifyOutcome {
  const errors = results
    .filter((result) => !result.success)
    .map((result) => `${result.channel}: ${result.error || "Unknown error"}`);

  if (deadlineExceeded) {
    errors.push("Notification deadline exceeded");
  }

  return {
    sent: results.filter((result) => result.success).length,
    failed:
      results.filter((result) => !result.success).length +
      (deadlineExceeded ? 1 : 0),
    errors,
  };
}

const MAX_CHANNELS_PER_FANOUT = 20;

export async function notifyMonitor(
  monitorId: string,
  userId: string,
  payload: NotificationPayload,
  deadlineAt?: number,
  dependencies: NotificationDependencies = defaultNotificationDependencies,
): Promise<NotifyOutcome> {
  const { store } = dependencies;

  const { userId: ownerId, error: monitorError } =
    await store.monitorOwner(monitorId);

  if (monitorError || !ownerId) {
    return {
      sent: 0,
      failed: 1,
      errors: [monitorError || "Monitor not found"],
    };
  }

  if (ownerId !== userId) {
    return { sent: 0, failed: 1, errors: ["Monitor ownership mismatch"] };
  }

  const { ids: linkedIds, error: linkError } =
    await store.linkedChannelIds(monitorId);

  if (linkError) {
    return { sent: 0, failed: 1, errors: [linkError] };
  }

  const { channels, error: channelError } =
    linkedIds.length > 0
      ? await store.channelsByIds(userId, linkedIds)
      : await store.defaultChannels(userId);

  if (channelError) {
    return { sent: 0, failed: 1, errors: [channelError] };
  }

  const candidates = channels.slice(0, MAX_CHANNELS_PER_FANOUT);
  // One batched vault read for the whole fan-out: credentials never reach
  // this process's own database queries, and never a response body.
  const configs = await dependencies.resolveConfigs(candidates);

  const results: Array<{ channel: string } & SendResult> = [];
  let deadlineExceeded = false;

  for (const channel of candidates) {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      deadlineExceeded = true;
      break;
    }

    const config = configs.get(channel.id);
    if (!config) {
      const result: SendResult = {
        success: false,
        error: "No stored credentials for channel",
      };
      console.error(
        `[notifyMonitor] ${channel.name}: ${result.error} (secret_id is null)`,
      );
      results.push({ channel: channel.name, ...result });
      continue;
    }

    const result = await sendNotification(
      channel.type,
      config,
      payload,
      dependencies,
    );

    if (result.success) {
      if (payload.status === "down") {
        safeTrack("Downtime Alert Triggered", { channel: channel.type });
      } else if (payload.status === "up") {
        safeTrack("Recovery Alert Triggered", { channel: channel.type });
      } else if (payload.status === "degraded") {
        safeTrack("Degraded Alert Triggered", { channel: channel.type });
      }
    } else {
      console.error(
        `[notifyMonitor] Failed to send to ${channel.name}: ${result.error}`,
      );
    }

    results.push({ channel: channel.name, ...result });
  }

  return summarise(results, deadlineExceeded);
}

export async function notifyUser(
  userId: string,
  payload: NotificationPayload,
  dependencies: NotificationDependencies = defaultNotificationDependencies,
): Promise<NotifyOutcome> {
  const { channels, error } =
    await dependencies.store.allActiveChannels(userId);

  if (error) {
    return { sent: 0, failed: 1, errors: [error] };
  }

  const configs = await dependencies.resolveConfigs(channels);
  const results: Array<{ channel: string } & SendResult> = [];

  for (const channel of channels) {
    const config = configs.get(channel.id);
    if (!config) {
      results.push({
        channel: channel.name,
        success: false,
        error: "No stored credentials for channel",
      });
      continue;
    }
    const result = await sendNotification(
      channel.type,
      config,
      payload,
      dependencies,
    );
    results.push({ channel: channel.name, ...result });
  }

  return summarise(results, false);
}
