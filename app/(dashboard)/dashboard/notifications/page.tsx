import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bell, Plus, Mail, Webhook, ExternalLink } from "lucide-react";
import {
  TelegramIcon,
  DiscordIcon,
  SlackIcon,
  TeamsIcon,
} from "@/components/icons";
import { TestNotificationButton } from "@/components/test-notification-button";

type NotificationChannel = {
  id: string;
  name: string;
  type:
    | "email"
    | "discord"
    | "slack"
    | "webhook"
    | "telegram"
    | "teams"
    | "pushover";
  active: boolean;
  created_at: string;
};

const typeConfig = {
  telegram: {
    icon: TelegramIcon,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    label: "Telegram",
  },
  email: {
    icon: Mail,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    label: "Email",
  },
  discord: {
    icon: DiscordIcon,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    label: "Discord",
  },
  slack: {
    icon: SlackIcon,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    label: "Slack",
  },
  teams: {
    icon: TeamsIcon,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    label: "Teams",
  },
  pushover: {
    icon: Bell,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    label: "Pushover",
  },
  webhook: {
    icon: Webhook,
    color: "text-muted-foreground",
    bg: "bg-muted",
    label: "Webhook",
  },
};

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: channelsData } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const channels = (channelsData || []) as NotificationChannel[];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">
              Notification Channels
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure how you receive alerts when monitors go down
            </p>
          </div>
          <Link href="/dashboard/notifications/new">
            <Button className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Add Channel
            </Button>
          </Link>
        </div>

        {/* Telegram Setup Guide */}
        <Card className="glass-card border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-500">
              <TelegramIcon className="h-6 w-6" />
              Telegram Setup Guide
            </CardTitle>
            <CardDescription>
              Follow these steps to set up Telegram notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                step: 1,
                text: "Message @BotFather on Telegram and create a new bot with /newbot",
                link: "https://t.me/BotFather",
              },
              { step: 2, text: "Copy the bot token provided by BotFather" },
              {
                step: 3,
                text: "Start a chat with your new bot or add it to a group",
              },
              {
                step: 4,
                text: "Get your chat ID by sending a message and visiting the getUpdates endpoint",
              },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-500">
                  {item.step}
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.link ? (
                    <>
                      {item.text.split("@BotFather")[0]}
                      <a
                        href={item.link}
                        target="_blank"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1"
                      >
                        @BotFather
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {item.text.split("@BotFather")[1]}
                    </>
                  ) : (
                    item.text
                  )}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Channels List */}
        {channels.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((channel) => {
              const config = typeConfig[channel.type] || typeConfig.webhook;
              const Icon = config.icon;

              return (
                <Card
                  key={channel.id}
                  className="glass-card hover:shadow-md transition-shadow"
                >
                  <CardContent className="flex flex-col gap-4 p-5">
                    <div className="flex items-start justify-between">
                      <div
                        className={`p-3 rounded-xl ${config.bg} transition-colors`}
                      >
                        <Icon className={`h-6 w-6 ${config.color}`} />
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          channel.active
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {channel.active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        )}
                        {channel.active ? "Active" : "Paused"}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg">{channel.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {config.label}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <TestNotificationButton channelId={channel.id} />
                      <Link
                        href={`/dashboard/notifications/${channel.id}/edit`}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-primary/10 rounded-2xl mb-4">
                <Bell className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                No notification channels
              </h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Add a notification channel to receive alerts when your monitors
                go down.
              </p>
              <Link href="/dashboard/notifications/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Channel
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
