/**
 * Notification senders, shared verbatim between the Next.js runtime and the
 * Supabase Edge Function in ../notification-dispatch.
 *
 * Constraints that keep this file usable in both runtimes:
 * - no `node:*` imports, no `Deno.*`, no `process.env`
 * - every outbound call goes through an injected `NotificationTransport`
 *
 * The transport is where each runtime puts its own egress policy: the
 * Next.js side injects SSRF-protected fetch, the edge function injects its
 * own resolver-based guard. That keeps one copy of the message formats
 * instead of two that drift.
 */

export const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;
export const REQUEST_TIMEOUT_MS = 2_000;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export type NotificationTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export type SendResult = { success: boolean; error?: string };

export interface NotificationPayload {
  title: string;
  message: string;
  monitorName?: string;
  monitorUrl?: string;
  status?: "up" | "down" | "degraded";
  timestamp?: string;
}

export interface TelegramConfig {
  bot_token: string;
  chat_id: string;
}

export interface DiscordConfig {
  webhook_url: string;
}

export interface SlackConfig {
  webhook_url: string;
}

export interface WebhookConfig {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
}

export interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  username: string;
  password: string;
  to: string;
}

export interface PushoverConfig {
  user_key: string;
  token: string;
  priority?: number;
  sound?: string;
}

export interface TeamsConfig {
  webhook_url: string;
}

export type NotificationConfig =
  | TelegramConfig
  | DiscordConfig
  | SlackConfig
  | WebhookConfig
  | EmailConfig
  | PushoverConfig
  | TeamsConfig;

export type NotificationType =
  "email" | "discord" | "slack" | "webhook" | "telegram" | "pushover" | "teams";

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

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wraps a transport with bounded retries and a per-attempt timeout.
 * Retryable means "worth another try", not "succeeded".
 */
export function withRetry(
  send: NotificationTransport,
  options: { maxAttempts?: number; timeoutMs?: number } = {},
): NotificationTransport {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return async (url, init) => {
    let lastError: unknown = new Error("Notification request failed");

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const requestInit = { ...init, signal: controller.signal };
        const response = await send(url, requestInit);

        if (
          response.ok ||
          !isRetryableStatus(response.status) ||
          attempt === maxAttempts - 1
        ) {
          return response;
        }

        if (response.body) {
          await response.body.cancel().catch(() => {});
        }
        await wait(retryDelay(response, attempt));
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        await wait(retryDelay(undefined, attempt));
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  };
}

function failure(error: unknown, vendor: string): SendResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : `Unknown ${vendor} error`,
  };
}

export async function sendTelegramNotification(
  config: TelegramConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  const statusEmoji =
    payload.status === "up" ? "✅" : payload.status === "down" ? "🔴" : "⚠️";
  const text = `${statusEmoji} *${escapeMarkdown(payload.title)}*

${escapeMarkdown(payload.message)}${payload.monitorName ? `\n\n📍 *Monitor:* ${escapeMarkdown(payload.monitorName)}` : ""}${payload.monitorUrl ? `\n🔗 *URL:* ${escapeMarkdown(payload.monitorUrl)}` : ""}${payload.timestamp ? `\n🕐 *Time:* ${escapeMarkdown(payload.timestamp)}` : ""}`;

  try {
    const response = await send(
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
    return failure(error, "Telegram");
  }
}

export async function sendDiscordNotification(
  config: DiscordConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  const color =
    payload.status === "up"
      ? 0x00ff00
      : payload.status === "down"
        ? 0xff0000
        : 0xffff00;

  try {
    const response = await send(config.webhook_url, {
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
    });

    return response.ok
      ? { success: true }
      : { success: false, error: `Discord API error: ${response.status}` };
  } catch (error) {
    return failure(error, "Discord");
  }
}

export async function sendSlackNotification(
  config: SlackConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  const color =
    payload.status === "up"
      ? "good"
      : payload.status === "down"
        ? "danger"
        : "warning";

  try {
    const response = await send(config.webhook_url, {
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
                ? { title: "Monitor", value: payload.monitorName, short: true }
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
    });

    return response.ok
      ? { success: true }
      : { success: false, error: `Slack API error: ${response.status}` };
  } catch (error) {
    return failure(error, "Slack");
  }
}

export async function sendPushoverNotification(
  config: PushoverConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
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

    const response = await send("https://api.pushover.net/1/messages.json", {
      method: "POST",
      body: formData,
    });
    const data = await readJson<{ status?: number; errors?: string[] }>(
      response,
    );

    if (!response.ok || data?.status !== 1) {
      return {
        success: false,
        error:
          data?.errors?.join(", ") || `Pushover API error: ${response.status}`,
      };
    }

    return { success: true };
  } catch (error) {
    return failure(error, "Pushover");
  }
}

export async function sendTeamsNotification(
  config: TeamsConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  const themeColor =
    payload.status === "up"
      ? "00FF00"
      : payload.status === "down"
        ? "FF0000"
        : "FFFF00";

  try {
    const response = await send(config.webhook_url, {
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
    });

    return response.ok
      ? { success: true }
      : { success: false, error: `Teams API error: ${response.status}` };
  } catch (error) {
    return failure(error, "Teams");
  }
}

export async function sendWebhookNotification(
  config: WebhookConfig,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  const method = config.method || "POST";
  const headers = {
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    ...config.headers,
  };

  try {
    const response = await send(config.url, {
      method,
      headers,
      ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
    });

    return response.ok
      ? { success: true }
      : { success: false, error: `Webhook error: ${response.status}` };
  } catch (error) {
    return failure(error, "webhook");
  }
}

export async function sendNotification(
  type: NotificationType,
  config: Record<string, unknown>,
  payload: NotificationPayload,
  send: NotificationTransport,
): Promise<SendResult> {
  switch (type) {
    case "telegram":
      return sendTelegramNotification(
        config as unknown as TelegramConfig,
        payload,
        send,
      );
    case "discord":
      return sendDiscordNotification(
        config as unknown as DiscordConfig,
        payload,
        send,
      );
    case "slack":
      return sendSlackNotification(
        config as unknown as SlackConfig,
        payload,
        send,
      );
    case "webhook":
      return sendWebhookNotification(
        config as unknown as WebhookConfig,
        payload,
        send,
      );
    case "pushover":
      return sendPushoverNotification(
        config as unknown as PushoverConfig,
        payload,
        send,
      );
    case "teams":
      return sendTeamsNotification(
        config as unknown as TeamsConfig,
        payload,
        send,
      );
    case "email":
      return {
        success: false,
        error: "Email notifications not yet implemented",
      };
    default:
      return { success: false, error: `Unknown notification type: ${type}` };
  }
}
