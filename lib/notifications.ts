import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { track } from "@vercel/analytics/server";
import { fetchWithSsrfProtection, resolveAndValidateUrl } from "@/lib/security";

import {
  type DiscordConfig,
  type NotificationConfig,
  type NotificationType,
  type PushoverConfig,
  type SlackConfig,
  type TeamsConfig,
  type TelegramConfig,
  type WebhookConfig,
} from "@/lib/notification-types";

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

export interface NotificationPayload {
  title: string;
  message: string;
  monitorName?: string;
  monitorUrl?: string;
  status?: "up" | "down" | "degraded";
  timestamp?: string;
}

type SendResult = { success: boolean; error?: string };

type NotificationChannel = {
  id: string;
  user_id: string;
  type: NotificationType;
  name: string;
  config: NotificationConfig;
  active: boolean;
};

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

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

function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, seconds * 1_000));
    }
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, dateDelay));
    }
  }
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** attempt);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  useSsrfProtection: boolean,
): Promise<Response> {
  let lastError: unknown = new Error("Notification request failed");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const requestInit = { ...init, signal: controller.signal };
      const response = useSsrfProtection
        ? await fetchWithSsrfProtection(url, requestInit)
        : await fetch(url, requestInit);

      if (
        response.ok ||
        !isRetryableStatus(response.status) ||
        attempt === MAX_ATTEMPTS - 1
      ) {
        return response;
      }

      if (response.body) {
        await response.body.cancel().catch(() => {});
      }
      await wait(retryDelay(response, attempt));
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      await wait(retryDelay(undefined, attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
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

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function sendTelegramNotification(
  config: TelegramConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  const statusEmoji =
    payload.status === "up" ? "✅" : payload.status === "down" ? "🔴" : "⚠️";
  const text = `${statusEmoji} *${escapeMarkdown(payload.title)}*

${escapeMarkdown(payload.message)}${payload.monitorName ? `\n\n📍 *Monitor:* ${escapeMarkdown(payload.monitorName)}` : ""}${payload.monitorUrl ? `\n🔗 *URL:* ${escapeMarkdown(payload.monitorUrl)}` : ""}${payload.timestamp ? `\n🕐 *Time:* ${escapeMarkdown(payload.timestamp)}` : ""}`;

  try {
    const response = await fetchWithRetry(
      `https://api.telegram.org/bot${config.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chat_id,
          text,
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        }),
      },
      false,
    );
    const data = await readJson<{ ok?: boolean; description?: string }>(
      response,
    );

    if (!response.ok || !data?.ok) {
      return {
        success: false,
        error: data?.description || `Telegram API error: ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Telegram error",
    };
  }
}

export async function sendDiscordNotification(
  config: DiscordConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  const validationError = await validateOutboundUrl(config.webhook_url);
  if (validationError) return validationError;

  const color =
    payload.status === "up"
      ? 0x00ff00
      : payload.status === "down"
        ? 0xff0000
        : 0xffff00;

  try {
    const response = await fetchWithRetry(
      config.webhook_url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [
            {
              title: payload.title,
              description: payload.message,
              color,
              fields: [
                payload.monitorName
                  ? {
                      name: "Monitor",
                      value: payload.monitorName,
                      inline: true,
                    }
                  : null,
                payload.monitorUrl
                  ? { name: "URL", value: payload.monitorUrl, inline: true }
                  : null,
              ].filter(Boolean),
              timestamp: payload.timestamp || new Date().toISOString(),
            },
          ],
        }),
      },
      true,
    );

    return response.ok
      ? { success: true }
      : { success: false, error: `Discord API error: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Discord error",
    };
  }
}

export async function sendSlackNotification(
  config: SlackConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  const validationError = await validateOutboundUrl(config.webhook_url);
  if (validationError) return validationError;

  const color =
    payload.status === "up"
      ? "good"
      : payload.status === "down"
        ? "danger"
        : "warning";

  try {
    const response = await fetchWithRetry(
      config.webhook_url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attachments: [
            {
              color,
              title: payload.title,
              text: payload.message,
              fields: [
                payload.monitorName
                  ? {
                      title: "Monitor",
                      value: payload.monitorName,
                      short: true,
                    }
                  : null,
                payload.monitorUrl
                  ? { title: "URL", value: payload.monitorUrl, short: true }
                  : null,
              ].filter(Boolean),
              ts: payload.timestamp
                ? new Date(payload.timestamp).getTime() / 1000
                : Date.now() / 1000,
            },
          ],
        }),
      },
      true,
    );

    return response.ok
      ? { success: true }
      : { success: false, error: `Slack API error: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Slack error",
    };
  }
}

export async function sendPushoverNotification(
  config: PushoverConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  try {
    const formData = new FormData();
    formData.append("user", config.user_key);
    formData.append("token", config.token);
    formData.append("title", payload.title);
    formData.append("message", payload.message);
    if (config.priority !== undefined) {
      formData.append("priority", config.priority.toString());
    }
    if (config.sound) formData.append("sound", config.sound);
    if (payload.monitorUrl) formData.append("url", payload.monitorUrl);
    if (payload.monitorName) formData.append("url_title", payload.monitorName);
    if (payload.timestamp) {
      formData.append(
        "timestamp",
        Math.floor(new Date(payload.timestamp).getTime() / 1000).toString(),
      );
    }

    const response = await fetchWithRetry(
      "https://api.pushover.net/1/messages.json",
      { method: "POST", body: formData },
      false,
    );
    const data = await readJson<{
      status?: number;
      errors?: string[];
    }>(response);

    if (!response.ok || data?.status !== 1) {
      return {
        success: false,
        error:
          data?.errors?.join(", ") || `Pushover API error: ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Pushover error",
    };
  }
}

export async function sendTeamsNotification(
  config: TeamsConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  const validationError = await validateOutboundUrl(config.webhook_url);
  if (validationError) return validationError;

  const themeColor =
    payload.status === "up"
      ? "00FF00"
      : payload.status === "down"
        ? "FF0000"
        : "FFFF00";

  try {
    const response = await fetchWithRetry(
      config.webhook_url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor,
          summary: payload.title,
          sections: [
            {
              activityTitle: payload.title,
              activitySubtitle: payload.message,
              facts: [
                payload.monitorName
                  ? { name: "Monitor", value: payload.monitorName }
                  : null,
                payload.monitorUrl
                  ? { name: "URL", value: payload.monitorUrl }
                  : null,
                payload.timestamp
                  ? { name: "Time", value: payload.timestamp }
                  : null,
              ].filter(Boolean),
              markdown: true,
            },
          ],
        }),
      },
      true,
    );

    return response.ok
      ? { success: true }
      : { success: false, error: `Teams API error: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Teams error",
    };
  }
}

export async function sendWebhookNotification(
  config: WebhookConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  const validationError = await validateOutboundUrl(config.url);
  if (validationError) return validationError;

  const method = config.method || "POST";
  const headers = {
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    ...config.headers,
  };

  try {
    const response = await fetchWithRetry(
      config.url,
      {
        method,
        headers,
        ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
      },
      true,
    );

    return response.ok
      ? { success: true }
      : { success: false, error: `Webhook error: ${response.status}` };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown webhook error",
    };
  }
}

export async function sendNotification(
  type: NotificationType,
  config: NotificationConfig,
  payload: NotificationPayload,
): Promise<SendResult> {
  switch (type) {
    case "telegram":
      return sendTelegramNotification(config as TelegramConfig, payload);
    case "discord":
      return sendDiscordNotification(config as DiscordConfig, payload);
    case "slack":
      return sendSlackNotification(config as SlackConfig, payload);
    case "webhook":
      return sendWebhookNotification(config as WebhookConfig, payload);
    case "pushover":
      return sendPushoverNotification(config as PushoverConfig, payload);
    case "teams":
      return sendTeamsNotification(config as TeamsConfig, payload);
    case "email":
      return {
        success: false,
        error: "Email notifications not yet implemented",
      };
    default:
      return { success: false, error: `Unknown notification type: ${type}` };
  }
}

export async function notifyMonitor(
  monitorId: string,
  userId: string,
  payload: NotificationPayload,
  deadlineAt?: number,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const supabase = createServiceClient();
  const { data: monitor, error: monitorError } = await supabase
    .from("monitors")
    .select("user_id")
    .eq("id", monitorId)
    .maybeSingle();

  if (monitorError || !monitor) {
    const error = monitorError?.message || "Monitor not found";
    return { sent: 0, failed: 1, errors: [error] };
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
      .select("*")
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
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .eq("is_default", true);

    if (defaultError) {
      return { sent: 0, failed: 1, errors: [defaultError.message] };
    }
    channels = (channelData || []) as unknown as NotificationChannel[];
  }

  const results: Array<{ channel: string } & SendResult> = [];
  let deadlineExceeded = false;
  for (const channel of channels.slice(0, 20)) {
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      deadlineExceeded = true;
      break;
    }
    const result = await sendNotification(
      channel.type,
      channel.config,
      payload,
    );
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

export async function notifyUser(
  userId: string,
  payload: NotificationPayload,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const supabase = await createClient();
  const { data: channelsData, error } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    return { sent: 0, failed: 1, errors: [error.message] };
  }

  const channels = (channelsData || []) as unknown as NotificationChannel[];
  const results: Array<{ channel: string } & SendResult> = [];

  for (const channel of channels) {
    const result = await sendNotification(
      channel.type,
      channel.config,
      payload,
    );
    results.push({ channel: channel.name, ...result });
  }

  return {
    sent: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    errors: results
      .filter((result) => !result.success)
      .map((result) => `${result.channel}: ${result.error || "Unknown error"}`),
  };
}
