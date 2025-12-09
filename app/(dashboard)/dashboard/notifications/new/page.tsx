"use client";

import React, { useState } from "react";
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
import { ArrowLeft, Mail, Webhook, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  TelegramIcon,
  DiscordIcon,
  SlackIcon,
  TeamsIcon,
} from "@/components/icons";

type ChannelType =
  | "telegram"
  | "discord"
  | "slack"
  | "webhook"
  | "email"
  | "teams";

const channelTypes: {
  type: ChannelType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  bg: string;
}[] = [
  {
    type: "telegram",
    name: "Telegram",
    icon: TelegramIcon,
    description: "Receive alerts via Telegram bot",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    type: "discord",
    name: "Discord",
    icon: DiscordIcon,
    description: "Post alerts to a Discord channel",
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
  },
  {
    type: "slack",
    name: "Slack",
    icon: SlackIcon,
    description: "Post alerts to a Slack channel",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    type: "teams",
    name: "Microsoft Teams",
    icon: TeamsIcon,
    description: "Post alerts to a Teams channel",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    type: "webhook",
    name: "Webhook",
    icon: Webhook,
    description: "Send alerts to a custom webhook URL",
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
  {
    type: "email",
    name: "Email",
    icon: Mail,
    description: "Receive alerts via email (coming soon)",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
];

export default function NewNotificationPage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<ChannelType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    bot_token: "",
    chat_id: "",
    webhook_url: "",
    email: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let config = {};
      switch (selectedType) {
        case "telegram":
          config = { bot_token: formData.bot_token, chat_id: formData.chat_id };
          break;
        case "teams":
        case "discord":
        case "slack":
          config = { webhook_url: formData.webhook_url };
          break;
        case "webhook":
          config = { url: formData.webhook_url, method: "POST" };
          break;
        case "email":
          config = { email: formData.email };
          break;
      }

      const response = await fetch("/api/notifications/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          type: selectedType,
          config,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create channel");
      }

      router.push("/dashboard/notifications");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    setIsLoading(true);
    setTestResult(null);
    setError(null);

    try {
      let config = {};
      switch (selectedType) {
        case "telegram":
          config = { bot_token: formData.bot_token, chat_id: formData.chat_id };
          break;
        case "teams":
        case "discord":
        case "slack":
          config = { webhook_url: formData.webhook_url };
          break;
        case "webhook":
          config = { url: formData.webhook_url, method: "POST" };
          break;
      }

      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedType, config }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: "Test notification sent successfully!",
        });
      } else {
        setTestResult({ success: false, message: data.error || "Test failed" });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/notifications">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Add Notification Channel</h1>
            <p className="text-neutral-600 dark:text-neutral-400 mt-1">
              Configure a new way to receive alerts
            </p>
          </div>
        </div>

        {/* Step 1: Select Type */}
        {!selectedType && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {channelTypes.map(
              ({ type, name, icon: Icon, description, color, bg }) => (
                <Card
                  key={type}
                  className={`cursor-pointer transition-all hover:shadow-lg group ${
                    type === "email"
                      ? "opacity-60 cursor-not-allowed grayscale"
                      : "hover:border-primary/50"
                  } ${selectedType === type ? "ring-2 ring-primary border-primary bg-primary/5" : "glass-card"}`}
                  onClick={() => type !== "email" && setSelectedType(type)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-lg ${bg} transition-transform group-hover:scale-110`}
                      >
                        <Icon className={`h-6 w-6 ${color}`} />
                      </div>
                      {name}
                    </CardTitle>
                    <CardDescription className="pt-1">
                      {description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ),
            )}
          </div>
        )}

        {/* Step 2: Configure */}
        {selectedType && (
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">
                {selectedType} Configuration
              </CardTitle>
              <CardDescription>
                Enter the details for your {selectedType} notification channel
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Channel Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., My Telegram Alerts"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>

                {selectedType === "telegram" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="bot_token">Bot Token</Label>
                      <Input
                        id="bot_token"
                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        value={formData.bot_token}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            bot_token: e.target.value,
                          })
                        }
                        required
                      />
                      <p className="text-xs text-neutral-500">
                        Get this from @BotFather
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="chat_id">Chat ID</Label>
                      <Input
                        id="chat_id"
                        placeholder="-1001234567890 or 123456789"
                        value={formData.chat_id}
                        onChange={(e) =>
                          setFormData({ ...formData, chat_id: e.target.value })
                        }
                        required
                      />
                      <p className="text-xs text-neutral-500">
                        Your user ID or group chat ID
                      </p>
                    </div>
                  </>
                )}

                {(selectedType === "discord" ||
                  selectedType === "slack" ||
                  selectedType === "teams" ||
                  selectedType === "webhook") && (
                  <div className="space-y-2">
                    <Label htmlFor="webhook_url">Webhook URL</Label>
                    <Input
                      id="webhook_url"
                      type="url"
                      placeholder="https://..."
                      value={formData.webhook_url}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          webhook_url: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
                    {error}
                  </div>
                )}

                {testResult && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      testResult.success
                        ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                        : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedType(null)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={isLoading || !formData.name}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Test
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Create Channel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
