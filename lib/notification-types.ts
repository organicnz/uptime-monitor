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
