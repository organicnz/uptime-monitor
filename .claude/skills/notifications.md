# Notification System

## Channel Types & Config

```typescript
type NotificationChannel = {
  id: string;
  user_id: string;
  name: string;
  type: "telegram" | "discord" | "slack" | "teams" | "pushover" | "webhook";
  config: Record<string, unknown>;
  is_default: boolean;
  active: boolean;
};

// Config schemas by type
type TelegramConfig = { bot_token: string; chat_id: string };
type DiscordConfig = { webhook_url: string };
type SlackConfig = { webhook_url: string };
type TeamsConfig = { webhook_url: string };
type PushoverConfig = { user_key: string; api_token: string };
type WebhookConfig = {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
};
```

## Sending Notifications

```typescript
// lib/notifications.ts
import { sendTelegram, sendDiscord, sendSlack } from "@/lib/notifications";

async function notifyChannel(channel: NotificationChannel, message: string) {
  switch (channel.type) {
    case "telegram":
      return sendTelegram(channel.config as TelegramConfig, message);
    case "discord":
      return sendDiscord(channel.config as DiscordConfig, message);
    case "slack":
      return sendSlack(channel.config as SlackConfig, message);
    // ...
  }
}
```

## Monitor-Channel Linking

Junction table `monitor_notifications` links monitors to channels:

```typescript
// Get channels for a monitor
const { data } = await supabase
  .from("monitor_notifications")
  .select("notification_channels(*)")
  .eq("monitor_id", monitorId);
```
