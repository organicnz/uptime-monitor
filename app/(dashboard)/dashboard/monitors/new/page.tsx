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
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Globe,
  Server,
  Zap,
  Search,
  Radio,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const monitorTypes = [
  {
    id: "http",
    name: "HTTP(s)",
    description: "Check URL response",
    icon: Globe,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  {
    id: "keyword",
    name: "Keyword",
    description: "Check for keyword",
    icon: Search,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  {
    id: "tcp",
    name: "TCP Port",
    description: "Check port status",
    icon: Server,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  {
    id: "ping",
    name: "Ping",
    description: "ICMP ping check",
    icon: Zap,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  {
    id: "dns",
    name: "DNS",
    description: "DNS resolution",
    icon: Radio,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
  },
];

export default function NewMonitorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "http" as "http" | "tcp" | "ping" | "keyword" | "dns",
    url: "",
    hostname: "",
    port: 443,
    method: "GET",
    keyword: "",
    interval: 60,
    timeout: 30,
    max_retries: 3,
    description: "",
  });

  const selectedType = monitorTypes.find((t) => t.id === formData.type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be logged in to create a monitor");
        setLoading(false);
        return;
      }

      const monitorData: Record<string, unknown> = {
        user_id: user.id,
        name: formData.name,
        type: formData.type,
        interval: formData.interval,
        timeout: formData.timeout,
        max_retries: formData.max_retries,
        description: formData.description || null,
        active: true,
      };

      if (formData.type === "http" || formData.type === "keyword") {
        monitorData.url = formData.url;
        monitorData.method = formData.method;
        if (formData.type === "keyword") {
          monitorData.keyword = formData.keyword;
        }
      } else if (formData.type === "tcp") {
        monitorData.hostname = formData.hostname;
        monitorData.port = formData.port;
      } else if (formData.type === "ping" || formData.type === "dns") {
        monitorData.hostname = formData.hostname;
      }

      const { data, error: insertError } = await supabase
        .from("monitors")
        .insert([monitorData] as unknown as never)
        .select()
        .single();

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        router.push(
          `/dashboard/monitors/${(data as unknown as { id: string }).id}`,
        );
      }, 500);
    } catch (err) {
      console.error("Error creating monitor:", err);
      setError(err instanceof Error ? err.message : "Failed to create monitor");
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/monitors"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Monitors
        </Link>
        <h1 className="text-3xl font-bold gradient-text">Create New Monitor</h1>
        <p className="text-muted-foreground mt-1">
          Set up monitoring for your services
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-xl">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 px-4 py-3 rounded-xl">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          Monitor created successfully! Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Monitor Type Selection */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Monitor Type</CardTitle>
            <CardDescription>
              Choose what kind of check to perform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {monitorTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = formData.type === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => updateField("type", type.id)}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all text-left",
                      isSelected
                        ? `${type.border} ${type.bg}`
                        : "border-border hover:border-border/80 hover:bg-muted/50",
                    )}
                  >
                    <div className={cn("p-2 rounded-lg w-fit mb-2", type.bg)}>
                      <Icon className={cn("h-5 w-5", type.color)} />
                    </div>
                    <p
                      className={cn(
                        "font-medium text-sm",
                        isSelected ? type.color : "",
                      )}
                    >
                      {type.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {type.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Basic Configuration */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedType && (
                <div className={cn("p-1.5 rounded-lg", selectedType.bg)}>
                  <selectedType.icon
                    className={cn("h-4 w-4", selectedType.color)}
                  />
                </div>
              )}
              Configuration
            </CardTitle>
            <CardDescription>
              Configure your {selectedType?.name} monitor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Monitor Name *</Label>
                <Input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="My Website"
                  className="h-11"
                />
              </div>

              {(formData.type === "http" || formData.type === "keyword") && (
                <div className="space-y-2">
                  <Label htmlFor="method">HTTP Method</Label>
                  <select
                    id="method"
                    value={formData.method}
                    onChange={(e) => updateField("method", e.target.value)}
                    className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="HEAD">HEAD</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
              )}
            </div>

            {/* URL field for HTTP/Keyword */}
            {(formData.type === "http" || formData.type === "keyword") && (
              <div className="space-y-2">
                <Label htmlFor="url">URL *</Label>
                <Input
                  id="url"
                  type="url"
                  required
                  value={formData.url}
                  onChange={(e) => updateField("url", e.target.value)}
                  placeholder="https://example.com"
                  className="h-11"
                />
              </div>
            )}

            {/* Keyword field */}
            {formData.type === "keyword" && (
              <div className="space-y-2">
                <Label htmlFor="keyword">Keyword to Find *</Label>
                <Input
                  id="keyword"
                  type="text"
                  required
                  value={formData.keyword}
                  onChange={(e) => updateField("keyword", e.target.value)}
                  placeholder="Welcome, OK, Success..."
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  The monitor will be marked UP only if this keyword is found
                </p>
              </div>
            )}

            {/* Hostname field for TCP/Ping/DNS */}
            {(formData.type === "tcp" ||
              formData.type === "ping" ||
              formData.type === "dns") && (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className={formData.type === "tcp" ? "" : "sm:col-span-2"}>
                  <div className="space-y-2">
                    <Label htmlFor="hostname">Hostname *</Label>
                    <Input
                      id="hostname"
                      type="text"
                      required
                      value={formData.hostname}
                      onChange={(e) => updateField("hostname", e.target.value)}
                      placeholder="example.com or 192.168.1.1"
                      className="h-11"
                    />
                  </div>
                </div>
                {formData.type === "tcp" && (
                  <div className="space-y-2">
                    <Label htmlFor="port">Port *</Label>
                    <Input
                      id="port"
                      type="number"
                      required
                      min="1"
                      max="65535"
                      value={formData.port}
                      onChange={(e) =>
                        updateField("port", parseInt(e.target.value))
                      }
                      placeholder="443"
                      className="h-11"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                rows={2}
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Add notes about this monitor..."
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Advanced Settings</CardTitle>
            <CardDescription>Fine-tune check behavior</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interval">Check Interval</Label>
                <div className="relative">
                  <Input
                    id="interval"
                    type="number"
                    min="60"
                    max="3600"
                    value={formData.interval}
                    onChange={(e) =>
                      updateField("interval", parseInt(e.target.value))
                    }
                    className="h-11 pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    sec
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout">Timeout</Label>
                <div className="relative">
                  <Input
                    id="timeout"
                    type="number"
                    min="1"
                    max="120"
                    value={formData.timeout}
                    onChange={(e) =>
                      updateField("timeout", parseInt(e.target.value))
                    }
                    className="h-11 pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    sec
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_retries">Retries</Label>
                <Input
                  id="max_retries"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.max_retries}
                  onChange={(e) =>
                    updateField("max_retries", parseInt(e.target.value))
                  }
                  className="h-11"
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Monitor will be marked DOWN after {formData.max_retries + 1}{" "}
              consecutive failures
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={loading || success}
            className="flex-1 h-11 shadow-lg shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Created!
              </>
            ) : (
              "Create Monitor"
            )}
          </Button>
          <Link href="/dashboard/monitors">
            <Button type="button" variant="outline" className="h-11">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
