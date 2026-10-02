export const notificationTypes = [
  "email",
  "discord",
  "slack",
  "webhook",
  "telegram",
  "pushover",
  "teams",
] as const;

export type NotificationType = (typeof notificationTypes)[number];

/**
 * The per-type config shapes live in the shared sender module so the app and
 * the edge function cannot disagree about a field name.
 */
export type {
  DiscordConfig,
  EmailConfig,
  NotificationConfig,
  PushoverConfig,
  SlackConfig,
  TeamsConfig,
  TelegramConfig,
  WebhookConfig,
} from "../supabase/functions/_shared/senders";

/**
 * Config fields that must never be stored in `notification_channels.config`
 * and must never leave the server. Everything here lives in `vault.secrets`
 * and is read only through the `notification_channel_secret(s)` RPCs.
 *
 * Keep in lockstep with the backfill and the
 * `notification_channels_config_has_no_secrets` CHECK constraint in
 * supabase/migrations/20260927094500_add_vault_notification_secrets.sql.
 */
export const SENSITIVE_CONFIG_KEYS = {
  email: ["smtp_host", "smtp_port", "username", "password", "to"],
  discord: ["webhook_url"],
  pushover: ["user_key", "token"],
  slack: ["webhook_url"],
  teams: ["webhook_url"],
  telegram: ["bot_token"],
  webhook: ["url", "headers"],
} as const satisfies Record<NotificationType, readonly string[]>;

export const ALL_SENSITIVE_CONFIG_KEYS: readonly string[] = [
  ...new Set(Object.values(SENSITIVE_CONFIG_KEYS).flat()),
];

export function isSensitiveConfigKey(
  type: NotificationType,
  key: string,
): boolean {
  return (SENSITIVE_CONFIG_KEYS[type] as readonly string[]).includes(key);
}

export type SplitChannelConfig = {
  /** Non-sensitive settings: safe to store in `config` and to render. */
  config: Record<string, unknown>;
  /** Credential fields: goes to the vault, never to the browser. */
  secret: Record<string, unknown>;
};

/**
 * Splits a full config into its persistable and secret halves. The server
 * calls this on every write, so a client that (deliberately or not) puts a
 * credential in `config` still cannot get it stored there.
 */
export function splitChannelConfig(
  type: NotificationType,
  config: Record<string, unknown>,
): SplitChannelConfig {
  const split: SplitChannelConfig = { config: {}, secret: {} };

  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === "") continue;
    if (isSensitiveConfigKey(type, key)) {
      split.secret[key] = value;
    } else {
      split.config[key] = value;
    }
  }

  return split;
}

/** Rebuilds the config a sender needs from the non-secret and secret halves. */
export function mergeChannelConfig(
  config: Record<string, unknown>,
  secret: Record<string, unknown> | null,
): Record<string, unknown> {
  return { ...config, ...(secret ?? {}) };
}
