"use client";

import { useState } from "react";
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
import { ArrowLeft, MessageCircle, Mail, Webhook, Loader2 } from "lucide-react";
import Link from "next/link";

type ChannelType = "telegram" | "discord" | "slack" | "webhook" | "email";

const channelTypes: {
  type: ChannelType;
  name: string;
  icon: typeof MessageCircle;
  description: string;
}[] = [
  {
    type: "telegram",
    name: "Telegram",
    icon: MessageCircle,
    description: "Receive alerts via Telegram bot",
  },
  {
    type: "discord",
    name: "Discord",
    icon: MessageCircle,
    description: "Post alerts to a Discord channel",
  },
  {
    type: "slack",
    name: "Slack",
    icon: MessageCircle,
    description: "Post alerts to a Slack channel",
  },
  {
    type: "webhook",
    name: "Webhook",
    icon: Webhook,
    description: "Send alerts to a custom webhook URL",
  },
  {
    type: "email",
    name: "Email",
    icon: Mail,
    description: "Receive alerts via email (coming soon)",
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
          {channelTypes.map(({ type, name, icon: Icon, description }) => (
            <Card
              key={type}
              className={`cursor-pointer transition-all hover:border-blue-500 hover:shadow-md ${
                type === "email" ? "opacity-50 cursor-not-allowed" : ""
              }`}
              onClick={() => type !== "email" && setSelectedType(type)}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {name}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
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
                        setFormData({ ...formData, bot_token: e.target.value })
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
                selectedType === "webhook") && (
                <div className="space-y-2">
                  <Label htmlFor="webhook_url">Webhook URL</Label>
                  <Input
                    id="webhook_url"
                    type="url"
                    placeholder="https://..."
                    value={formData.webhook_url}
                    onChange={(e) =>
                      setFormData({ ...formData, webhook_url: e.target.value })
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
  );
}
