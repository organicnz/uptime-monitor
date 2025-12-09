"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Trash2,
  MessageCircle,
  Mail,
  Webhook,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bell,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

type ChannelType =
  | "telegram"
  | "discord"
  | "slack"
  | "webhook"
  | "email"
  | "teams"
  | "pushover";

type NotificationChannel = {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, string>;
  active: boolean;
  is_default: boolean;
};

const typeConfig = {
  telegram: { icon: MessageCircle, label: "Telegram" },
  discord: { icon: MessageCircle, label: "Discord" },
  slack: { icon: MessageCircle, label: "Slack" },
  teams: { icon: MessageCircle, label: "Microsoft Teams" },
  pushover: { icon: Bell, label: "Pushover" },
  webhook: { icon: Webhook, label: "Webhook" },
  email: { icon: Mail, label: "Email" },
};

export default function EditNotificationPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    active: true,
    is_default: false,
    bot_token: "",
    chat_id: "",
    webhook_url: "",
    user_key: "",
    api_token: "",
  });

  useEffect(() => {
    const loadChannel = async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("notification_channels")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error) throw error;

        const channelData = data as unknown as NotificationChannel;
        setChannel(channelData);

        const config = channelData.config || {};
        setFormData({
          name: channelData.name || "",
          active: channelData.active ?? true,
          is_default: channelData.is_default ?? false,
          bot_token: config.bot_token || "",
          chat_id: config.chat_id || "",
          webhook_url: config.webhook_url || config.url || "",
          user_key: config.user_key || "",
          api_token: config.api_token || "",
        });
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load channel");
        setLoading(false);
      }
    };

    loadChannel();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (!channel) throw new Error("Channel not loaded");

      let config: Record<string, string> = {};
      switch (channel.type) {
        case "telegram":
          config = { bot_token: formData.bot_token, chat_id: formData.chat_id };
          break;
        case "discord":
        case "slack":
        case "teams":
          config = { webhook_url: formData.webhook_url };
          break;
        case "webhook":
          config = { url: formData.webhook_url, method: "POST" };
          break;
        case "pushover":
          config = {
            user_key: formData.user_key,
            api_token: formData.api_token,
          };
          break;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("notification_channels")
        .update({
          name: formData.name,
          config,
          active: formData.active,
          is_default: formData.is_default,
        } as unknown as never)
        .eq("id", params.id);

      if (updateError) throw updateError;

      setSuccess(true);
      toast.success("Channel updated successfully");
      setTimeout(() => {
        router.push("/dashboard/notifications");
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update channel");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm("Are you sure you want to delete this notification channel?")
    ) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("notification_channels")
        .delete()
        .eq("id", params.id);

      if (deleteError) throw deleteError;

      toast.success("Channel deleted");
      router.push("/dashboard/notifications");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete channel");
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    try {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: params.id }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Test notification sent!");
      } else {
        toast.error(data.error || "Test failed");
      }
    } catch {
      toast.error("Failed to send test notification");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading channel...</p>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
          <p className="text-muted-foreground">Channel not found</p>
          <Link href="/dashboard/notifications">
            <Button variant="outline" className="mt-4">
              Back to Notifications
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const config = typeConfig[channel.type] || typeConfig.webhook;
  const Icon = config.icon;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/dashboard/notifications"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Notifications
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">
                  Edit {config.label} Channel
                </h1>
                <p className="text-muted-foreground">{channel.name}</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-lg">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 px-4 py-3 rounded-lg">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            Channel updated successfully! Redirecting...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Channel Settings</CardTitle>
              <CardDescription>
                Update your {config.label} notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Channel Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              {channel.type === "telegram" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="bot_token">Bot Token</Label>
                    <Input
                      id="bot_token"
                      value={formData.bot_token}
                      onChange={(e) =>
                        setFormData({ ...formData, bot_token: e.target.value })
                      }
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Get this from @BotFather
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="chat_id">Chat ID</Label>
                    <Input
                      id="chat_id"
                      value={formData.chat_id}
                      onChange={(e) =>
                        setFormData({ ...formData, chat_id: e.target.value })
                      }
                      placeholder="-1001234567890 or 123456789"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Your user ID or group chat ID
                    </p>
                  </div>
                </>
              )}

              {(channel.type === "discord" ||
                channel.type === "slack" ||
                channel.type === "teams" ||
                channel.type === "webhook") && (
                <div className="space-y-2">
                  <Label htmlFor="webhook_url">Webhook URL</Label>
                  <Input
                    id="webhook_url"
                    type="url"
                    value={formData.webhook_url}
                    onChange={(e) =>
                      setFormData({ ...formData, webhook_url: e.target.value })
                    }
                    placeholder="https://..."
                    required
                  />
                </div>
              )}

              {channel.type === "pushover" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="user_key">User Key</Label>
                    <Input
                      id="user_key"
                      value={formData.user_key}
                      onChange={(e) =>
                        setFormData({ ...formData, user_key: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api_token">API Token</Label>
                    <Input
                      id="api_token"
                      value={formData.api_token}
                      onChange={(e) =>
                        setFormData({ ...formData, api_token: e.target.value })
                      }
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="space-y-0.5">
                  <Label htmlFor="active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive notifications from this channel
                  </p>
                </div>
                <Switch
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, active: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="is_default">Default Channel</Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-assign to new monitors
                  </p>
                </div>
                <Switch
                  id="is_default"
                  checked={formData.is_default}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_default: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Channel
            </Button>

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleTest}>
                Test
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
