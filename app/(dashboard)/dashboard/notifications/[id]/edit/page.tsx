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
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { splitChannelConfig } from "@/lib/notification-types";

type ChannelType =
  "telegram" | "discord" | "slack" | "webhook" | "email" | "teams" | "pushover";

type NotificationChannel = {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, string>;
  active: boolean;
  is_default: boolean;
  has_secret: boolean;
};

const SECRET_PLACEHOLDER = "••••••••••••";

const typeConfig = {
  telegram: { icon: MessageCircle, label: "Telegram" },
  discord: { icon: MessageCircle, label: "Discord" },
  slack: { icon: MessageCircle, label: "Slack" },
  teams: { icon: MessageCircle, label: "Microsoft Teams" },
  pushover: { icon: Bell, label: "Pushover" },
  webhook: { icon: Webhook, label: "Webhook" },
  email: { icon: Mail, label: "Email" },
};

/** Credential fields per type, and how to label them. */
type FieldDef = { key: string; label: string; hint?: string; type?: string };

const secretFields: Record<ChannelType, FieldDef[]> = {
  telegram: [
    {
      key: "bot_token",
      label: "Bot Token",
      hint: "Get this from @BotFather",
    },
  ],
  discord: [{ key: "webhook_url", label: "Webhook URL", type: "url" }],
  slack: [{ key: "webhook_url", label: "Webhook URL", type: "url" }],
  teams: [{ key: "webhook_url", label: "Webhook URL", type: "url" }],
  webhook: [{ key: "url", label: "Webhook URL", type: "url" }],
  pushover: [
    { key: "user_key", label: "User Key" },
    { key: "token", label: "API Token" },
  ],
  email: [
    { key: "smtp_host", label: "SMTP Host" },
    { key: "smtp_port", label: "SMTP Port" },
    { key: "username", label: "Username" },
    { key: "password", label: "Password", type: "password" },
    { key: "to", label: "Recipient", type: "email" },
  ],
};

/** Non-credential fields that stay in the `config` column. */
const publicFields: Record<ChannelType, FieldDef[]> = {
  telegram: [
    { key: "chat_id", label: "Chat ID", hint: "Your user ID or group chat ID" },
  ],
  discord: [],
  slack: [],
  teams: [],
  webhook: [],
  pushover: [],
  email: [],
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
  });
  const [publicForm, setPublicForm] = useState<Record<string, string>>({});
  // Credential inputs start empty on purpose. A stored credential is never
  // sent to the browser, so an empty field means "keep what is stored".
  const [secretForm, setSecretForm] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadChannel = async () => {
      try {
        const response = await fetch(
          `/api/notifications/channels?id=${encodeURIComponent(params.id)}`,
        );
        if (!response.ok) throw new Error("Channel not found");

        const body = (await response.json()) as {
          channel?: NotificationChannel;
        };
        if (!body.channel) throw new Error("Channel not found");

        const loaded = body.channel;
        setChannel(loaded);

        const config = loaded.config || {};
        const publicValues: Record<string, string> = {};
        for (const field of publicFields[loaded.type] ?? []) {
          publicValues[field.key] = config[field.key] ?? "";
        }
        setPublicForm(publicValues);
        setFormData({
          name: loaded.name || "",
          active: loaded.active ?? true,
          is_default: loaded.is_default ?? false,
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

      // splitChannelConfig is a belt-and-braces guard: the server splits
      // again, so a credential can never be persisted in `config`.
      const { config, secret } = splitChannelConfig(channel.type, {
        ...publicForm,
        ...secretForm,
      } as Record<string, unknown>);

      const response = await fetch("/api/notifications/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: params.id,
          name: formData.name,
          active: formData.active,
          is_default: formData.is_default,
          config,
          secret,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Failed to update channel");
      }

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
      const response = await fetch(
        `/api/notifications/channels?id=${encodeURIComponent(params.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Failed to delete channel");
      }

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

              {(publicFields[channel.type] ?? []).map((field) => (
                <div className="space-y-2" key={field.key}>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    value={publicForm[field.key] ?? ""}
                    onChange={(e) =>
                      setPublicForm({
                        ...publicForm,
                        [field.key]: e.target.value,
                      })
                    }
                    placeholder="-1001234567890 or 123456789"
                    required
                  />
                  {field.hint && (
                    <p className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  )}
                </div>
              ))}

              {channel.has_secret && (
                <div className="flex items-start gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-500" />
                  <span>
                    Credentials are encrypted at rest in Supabase Vault and are
                    never sent to this page. Leave a field below empty to keep
                    the stored value.
                  </span>
                </div>
              )}

              {(secretFields[channel.type] ?? []).map((field) => (
                <div className="space-y-2" key={field.key}>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    type={
                      field.type ??
                      (field.key === "webhook_url" ? "url" : "text")
                    }
                    autoComplete="off"
                    value={secretForm[field.key] ?? ""}
                    onChange={(e) =>
                      setSecretForm({
                        ...secretForm,
                        [field.key]: e.target.value,
                      })
                    }
                    placeholder={
                      channel.has_secret
                        ? SECRET_PLACEHOLDER
                        : field.key === "bot_token"
                          ? "123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                          : "https://..."
                    }
                    required={!channel.has_secret}
                  />
                  {field.hint && (
                    <p className="text-xs text-muted-foreground">
                      {field.hint}
                    </p>
                  )}
                </div>
              ))}

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
