import { track } from "@vercel/analytics/server";
import { fetchWithSsrfProtection, resolveAndValidateUrl } from "@/lib/security";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveChannelConfigs } from "@/lib/notification-channels";
import type {
  NotificationConfig,
  NotificationType,
} from "@/lib/notification-types";

import {
  sendNotification as sendSharedNotification,
  withRetry,
  type NotificationPayload,
  type NotificationTransport,
  type SendResult,
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
 * Fixed-vendor endpoints. Their host is part of the integration rather than
 * user input, so they skip the SSRF filter; every user-supplied destination
 * goes through `ssrfProtectedTransport`.
 */
const directSender = withRetry((url: string, init: RequestInit) =>
  fetch(url, init),
);
const ssrfSender = withRetry(fetchWithSsrfProtection);

/** Only user-supplied destinations are SSRF-filtered. */
function senderFor(type: NotificationType): NotificationTransport {
  return type === "telegram" || type === "pushover" || type === "email"
    ? directSender
    : ssrfSender;
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

async function validateOutboundUrl(url: string): Promise<SendResult | null> {
  try {
    await resolveAndValidateUrl(url);
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
): Promise<SendResult> {
  // Validate before sending so a blocked destination is reported as a
  // blocked destination rather than as a generic fetch failure.
  const url = outboundUrlFor(type, config);
  if (url) {
    const blocked = await validateOutboundUrl(url);
    if (blocked) return blocked;
  }

  return sendSharedNotification(
    type,
    config as unknown as Record<string, unknown>,
    payload,
    senderFor(type),
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
): Promise<NotifyOutcome> {
  const supabase = createServiceClient();
  const { data: monitor, error: monitorError } = await supabase
    .from("monitors")
    .select("user_id")
    .eq("id", monitorId)
    .maybeSingle();

  if (monitorError || !monitor) {
    return {
      sent: 0,
      failed: 1,
      errors: [monitorError?.message || "Monitor not found"],
    };
  }

  if (monitor.user_id !== userId) {
    return { sent: 0, failed: 1, errors: ["Monitor ownership mismatch"] };
  }

  const { data: linkedChannels, error: linkError } = await supabase
    .from("monitor_notifications")
    .select("channel_id")
    .eq("monitor_id", monitorId);

  if (linkError) {
    return { sent: 0, failed: 1, errors: [linkError.message] };
  }

  const linkedIds = ((linkedChannels || []) as { channel_id: string }[]).map(
    (link) => link.channel_id,
  );

  let channels: NotificationChannel[] = [];
  if (linkedIds.length > 0) {
    const { data: channelData, error: channelError } = await supabase
      .from("notification_channels")
      .select("id, user_id, name, type, config, active")
      .in("id", linkedIds)
      .eq("user_id", userId)
      .eq("active", true);

    if (channelError) {
      return { sent: 0, failed: 1, errors: [channelError.message] };
    }
    channels = (channelData || []) as unknown as NotificationChannel[];
  } else {
    const { data: channelData, error: defaultError } = await supabase
      .from("notification_channels")
      .select("id, user_id, name, type, config, active")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("is_default", true);

    if (defaultError) {
      return { sent: 0, failed: 1, errors: [defaultError.message] };
    }
    channels = (channelData || []) as unknown as NotificationChannel[];
  }

  const candidates = channels.slice(0, MAX_CHANNELS_PER_FANOUT);
  // One batched vault read for the whole fan-out: credentials never reach
  // this process's own database queries, and never a response body.
  const configs = await resolveChannelConfigs(candidates);

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

    const result = await sendNotification(channel.type, config, payload);

    if (result.success) {
      if (payload.status === "down") {
        safeTrack("Downtime Alert Triggered", { channel: channel.type });
      } else if (payload.status === "up") {
        safeTrack("Recovery Alert Triggered", { channel: channel.type });
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
): Promise<NotifyOutcome> {
  const supabase = createServiceClient();
  const { data: channelsData, error } = await supabase
    .from("notification_channels")
    .select("id, user_id, name, type, config, active")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    return { sent: 0, failed: 1, errors: [error.message] };
  }

  const channels = (channelsData || []) as unknown as NotificationChannel[];
  const configs = await resolveChannelConfigs(channels);
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
    const result = await sendNotification(channel.type, config, payload);
    results.push({ channel: channel.name, ...result });
  }

  return summarise(results, false);
}
