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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Trash2,
  Globe,
  Server,
  Zap,
  Search,
  Radio,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Power,
  PowerOff,
  Clock,
  Bell,
  MessageCircle,
  Mail,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const CRON_INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 minute", dailyMessages: 1440 },
  { value: "2", label: "Every 2 minutes", dailyMessages: 720 },
  { value: "3", label: "Every 3 minutes", dailyMessages: 480 },
  { value: "5", label: "Every 5 minutes", dailyMessages: 288 },
  { value: "10", label: "Every 10 minutes", dailyMessages: 144 },
  { value: "15", label: "Every 15 minutes", dailyMessages: 96 },
  { value: "30", label: "Every 30 minutes", dailyMessages: 48 },
  { value: "60", label: "Every 1 hour", dailyMessages: 24 },
];

const monitorTypes = [
  {
    id: "http",
    name: "HTTP(s)",
    icon: Globe,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
  },
  {
    id: "keyword",
    name: "Keyword",
    icon: Search,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
  },
  {
    id: "tcp",
    name: "TCP Port",
    icon: Server,
    color: "text-orange-400",
    bg: "bg-orange-500/20",
  },
  {
    id: "ping",
    name: "Ping",
    icon: Zap,
    color: "text-green-400",
    bg: "bg-green-500/20",
  },
  {
    id: "dns",
    name: "DNS",
    icon: Radio,
    color: "text-cyan-400",
    bg: "bg-cyan-500/20",
  },
];

export default function EditMonitorPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "http" as "http" | "tcp" | "ping" | "keyword" | "dns",
    url: "",
    hostname: "",
    port: 80,
    method: "GET",
    keyword: "",
    interval: 60,
    timeout: 30,
    max_retries: 3,
    description: "",
    active: true,
    headers: {} as Record<string, string>,
  });

  // QStash schedule state
  const [cronSchedule, setCronSchedule] = useState<{
    id: string;
    intervalMinutes: number;
    isPaused: boolean;
  } | null>(null);
  const [cronLoading, setCronLoading] = useState(true);
  const [cronSaving, setCronSaving] = useState(false);

  // Notification channels state
  type NotificationChannel = {
    id: string;
    name: string;
    type: string;
    active: boolean;
  };
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);

  const selectedType = monitorTypes.find((t) => t.id === formData.type);

  useEffect(() => {
    const loadMonitor = async () => {
      try {
        const supabase = createClient();

        type MonitorData = {
          name: string;
          type: string;
          url: string | null;
          hostname: string | null;
          port: number | null;
          method: string | null;
          keyword: string | null;
          interval: number;
          timeout: number;
          max_retries: number;
          description: string | null;
          active: boolean;
          headers: Record<string, string> | null;
        };

        const { data, error } = await supabase
          .from("monitors")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error) throw error;

        const monitorData = data as unknown as MonitorData;

        setFormData({
          name: monitorData.name || "",
          type:
            (monitorData.type as "http" | "tcp" | "ping" | "keyword" | "dns") ||
            "http",
          url: monitorData.url || "",
          hostname: monitorData.hostname || "",
          port: monitorData.port || 80,
          method: monitorData.method || "GET",
          keyword: monitorData.keyword || "",
          interval: monitorData.interval || 60,
          timeout: monitorData.timeout || 30,
          max_retries: monitorData.max_retries || 3,
          description: monitorData.description || "",
          active: monitorData.active ?? true,
          headers: (monitorData.headers as Record<string, string>) || {},
        });
        setLoading(false);
      } catch (err) {
        console.error("Error loading monitor:", err);
        setError(err instanceof Error ? err.message : "Failed to load monitor");
        setLoading(false);
      }
    };

    const loadCronSchedule = async () => {
      try {
        const res = await fetch("/api/settings/schedule");
        const data = await res.json();
        if (data.schedule) {
          setCronSchedule({
            id: data.schedule.id,
            intervalMinutes: data.schedule.intervalMinutes,
            isPaused: data.schedule.isPaused,
          });
        }
      } catch (err) {
        console.error("Error loading cron schedule:", err);
      } finally {
        setCronLoading(false);
      }
    };

    const loadNotificationChannels = async () => {
      try {
        const supabase = createClient();

        // Load all user's notification channels
        const { data: channelsData } = await supabase
          .from("notification_channels")
          .select("id, name, type, active")
          .order("name");

        setChannels((channelsData || []) as NotificationChannel[]);

        // Load currently linked channels for this monitor
        const { data: linkedData } = await supabase
          .from("monitor_notifications")
          .select("channel_id")
          .eq("monitor_id", params.id);

        const linkedIds = ((linkedData || []) as { channel_id: string }[]).map(
          (l) => l.channel_id,
        );
        setSelectedChannels(linkedIds);
      } catch (err) {
        console.error("Error loading notification channels:", err);
      } finally {
        setChannelsLoading(false);
      }
    };

    loadMonitor();
    loadCronSchedule();
    loadNotificationChannels();
  }, [params.id]);

  const handleCronIntervalChange = async (value: string) => {
    if (!cronSchedule) return;

    setCronSaving(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: cronSchedule.id,
          intervalMinutes: parseInt(value, 10),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update schedule");
      }

      setCronSchedule({
        ...cronSchedule,
        id: data.newScheduleId || cronSchedule.id,
        intervalMinutes: parseInt(value, 10),
      });
      toast.success(
        `Global check interval updated to every ${value} minute${value === "1" ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    } finally {
      setCronSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      const updateData: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        interval: formData.interval,
        timeout: formData.timeout,
        max_retries: formData.max_retries,
        description: formData.description || null,
        active: formData.active,
        headers:
          Object.keys(formData.headers).length > 0 ? formData.headers : null,
      };

      if (formData.type === "http" || formData.type === "keyword") {
        updateData.url = formData.url;
        updateData.method = formData.method;
        updateData.hostname = null;
        updateData.port = null;
        if (formData.type === "keyword") {
          updateData.keyword = formData.keyword;
        }
      } else if (formData.type === "tcp") {
        updateData.hostname = formData.hostname;
        updateData.port = formData.port;
        updateData.url = null;
      } else if (formData.type === "ping" || formData.type === "dns") {
        updateData.hostname = formData.hostname;
        updateData.url = null;
        updateData.port = null;
      }

      const { error: updateError } = await supabase
        .from("monitors")
        .update(updateData as unknown as never)
        .eq("id", params.id);

      if (updateError) throw updateError;

      // Update notification channel links
      // First, delete existing links
      await supabase
        .from("monitor_notifications")
        .delete()
        .eq("monitor_id", params.id);

      // Then insert new links
      if (selectedChannels.length > 0) {
        const links = selectedChannels.map((channelId) => ({
          monitor_id: params.id,
          channel_id: channelId,
        }));
        await supabase
          .from("monitor_notifications")
          .insert(links as unknown as never);
      }

      setSuccess(true);
      setTimeout(() => {
        router.push(`/dashboard/monitors/${params.id}`);
      }, 500);
    } catch (err) {
      console.error("Error updating monitor:", err);
      setError(err instanceof Error ? err.message : "Failed to update monitor");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this monitor? This cannot be undone.",
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from("monitors")
        .delete()
        .eq("id", params.id);

      if (deleteError) throw deleteError;

      router.push("/dashboard/monitors");
    } catch (err) {
      console.error("Error deleting monitor:", err);
      setError(err instanceof Error ? err.message : "Failed to delete monitor");
      setDeleting(false);
    }
  };

  const updateField = (field: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-green-400 mx-auto mb-4" />
          <p className="text-neutral-400">Loading monitor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/monitors/${params.id}`}
          className="inline-flex items-center text-sm text-neutral-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Monitor
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Edit Monitor</h1>
            <p className="text-neutral-400 mt-1">{formData.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => updateField("active", !formData.active)}
              className={`border-neutral-700 ${formData.active ? "text-green-400 hover:bg-green-950" : "text-yellow-400 hover:bg-yellow-950"}`}
            >
              {formData.active ? (
                <>
                  <Power className="h-4 w-4 mr-2" />
                  Active
                </>
              ) : (
                <>
                  <PowerOff className="h-4 w-4 mr-2" />
                  Paused
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 bg-green-950/50 border border-green-800 text-green-200 px-4 py-3 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
          Monitor updated successfully! Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Monitor Type */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white">Monitor Type</CardTitle>
            <CardDescription>Type of check to perform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {monitorTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = formData.type === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => updateField("type", type.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? "border-green-500 bg-green-500/10"
                        : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${type.bg} w-fit mb-2`}>
                      <Icon className={`h-5 w-5 ${type.color}`} />
                    </div>
                    <p
                      className={`font-medium ${isSelected ? "text-green-400" : "text-white"}`}
                    >
                      {type.name}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              {selectedType && (
                <div className={`p-1.5 rounded-lg ${selectedType.bg}`}>
                  <selectedType.icon
                    className={`h-4 w-4 ${selectedType.color}`}
                  />
                </div>
              )}
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-neutral-300">
                  Monitor Name *
                </Label>
                <input
                  id="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {(formData.type === "http" || formData.type === "keyword") && (
                <div>
                  <Label htmlFor="method" className="text-neutral-300">
                    HTTP Method
                  </Label>
                  <select
                    id="method"
                    value={formData.method}
                    onChange={(e) => updateField("method", e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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

            {(formData.type === "http" || formData.type === "keyword") && (
              <div>
                <Label htmlFor="url" className="text-neutral-300">
                  URL *
                </Label>
                <input
                  id="url"
                  type="url"
                  required
                  value={formData.url}
                  onChange={(e) => updateField("url", e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="https://example.com"
                />
              </div>
            )}

            {formData.type === "keyword" && (
              <div>
                <Label htmlFor="keyword" className="text-neutral-300">
                  Keyword *
                </Label>
                <input
                  id="keyword"
                  type="text"
                  required
                  value={formData.keyword}
                  onChange={(e) => updateField("keyword", e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            )}

            {(formData.type === "tcp" ||
              formData.type === "ping" ||
              formData.type === "dns") && (
              <div className="grid md:grid-cols-2 gap-4">
                <div className={formData.type === "tcp" ? "" : "md:col-span-2"}>
                  <Label htmlFor="hostname" className="text-neutral-300">
                    Hostname *
                  </Label>
                  <input
                    id="hostname"
                    type="text"
                    required
                    value={formData.hostname}
                    onChange={(e) => updateField("hostname", e.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
                {formData.type === "tcp" && (
                  <div>
                    <Label htmlFor="port" className="text-neutral-300">
                      Port *
                    </Label>
                    <input
                      id="port"
                      type="number"
                      required
                      min="1"
                      max="65535"
                      value={formData.port}
                      onChange={(e) =>
                        updateField("port", parseInt(e.target.value))
                      }
                      className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="description" className="text-neutral-300">
                Description
              </Label>
              <textarea
                id="description"
                rows={2}
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Custom Headers - only for HTTP types */}
        {(formData.type === "http" || formData.type === "keyword") && (
          <Card className="bg-neutral-900/50 border-neutral-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-400" />
                Custom Headers
              </CardTitle>
              <CardDescription>
                Add custom headers to send with monitor requests
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={`border-amber-600 text-amber-400 hover:bg-amber-950 ${
                    formData.headers["x-vercel-protection-bypass"]
                      ? "bg-amber-950"
                      : ""
                  }`}
                  onClick={() => {
                    const newHeaders = { ...formData.headers };
                    if (newHeaders["x-vercel-protection-bypass"]) {
                      delete newHeaders["x-vercel-protection-bypass"];
                    } else {
                      newHeaders["x-vercel-protection-bypass"] =
                        "YOUR_32_CHAR_SECRET";
                    }
                    setFormData((prev) => ({ ...prev, headers: newHeaders }));
                  }}
                >
                  <Shield className="h-4 w-4 mr-1" />
                  {formData.headers["x-vercel-protection-bypass"]
                    ? "Remove Vercel Bypass"
                    : "Add Vercel Bypass Header"}
                </Button>
              </div>

              {/* Current Headers */}
              {Object.keys(formData.headers).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-neutral-300 text-sm">
                    Active Headers
                  </Label>
                  {Object.entries(formData.headers).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={key}
                        readOnly
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2 text-sm text-neutral-300"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const newHeaders = { ...formData.headers };
                          newHeaders[key] = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            headers: newHeaders,
                          }));
                        }}
                        placeholder={
                          key === "x-vercel-protection-bypass"
                            ? "Enter your 32-char secret"
                            : "Value"
                        }
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/50"
                        onClick={() => {
                          const newHeaders = { ...formData.headers };
                          delete newHeaders[key];
                          setFormData((prev) => ({
                            ...prev,
                            headers: newHeaders,
                          }));
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Header */}
              <div className="pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  className="text-sm text-green-400 hover:text-green-300"
                  onClick={() => {
                    const key = prompt("Enter header name:");
                    if (key && key.trim()) {
                      const newHeaders = { ...formData.headers };
                      newHeaders[key.trim()] = "";
                      setFormData((prev) => ({ ...prev, headers: newHeaders }));
                    }
                  }}
                >
                  + Add custom header
                </button>
              </div>

              {formData.headers["x-vercel-protection-bypass"] && (
                <div className="mt-3 p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg text-sm text-amber-200">
                  <p className="font-medium mb-1">To get your bypass secret:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Go to Vercel Dashboard → Project → Settings</li>
                    <li>Navigate to Deployment Protection</li>
                    <li>
                      Under &quot;Protection Bypass for Automation&quot;, add a
                      secret
                    </li>
                    <li>Copy the 32-character value here</li>
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Advanced */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white">Advanced Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="interval" className="text-neutral-300">
                  Interval
                </Label>
                <div className="mt-1.5 relative">
                  <input
                    id="interval"
                    type="number"
                    min="60"
                    value={formData.interval}
                    onChange={(e) =>
                      updateField("interval", parseInt(e.target.value))
                    }
                    className="block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 pr-12 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
                    sec
                  </span>
                </div>
              </div>
              <div>
                <Label htmlFor="timeout" className="text-neutral-300">
                  Timeout
                </Label>
                <div className="mt-1.5 relative">
                  <input
                    id="timeout"
                    type="number"
                    min="1"
                    max="120"
                    value={formData.timeout}
                    onChange={(e) =>
                      updateField("timeout", parseInt(e.target.value))
                    }
                    className="block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 pr-12 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">
                    sec
                  </span>
                </div>
              </div>
              <div>
                <Label htmlFor="max_retries" className="text-neutral-300">
                  Retries
                </Label>
                <input
                  id="max_retries"
                  type="number"
                  min="0"
                  max="10"
                  value={formData.max_retries}
                  onChange={(e) =>
                    updateField("max_retries", parseInt(e.target.value))
                  }
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Global Cron Schedule */}
            <div className="pt-4 border-t border-neutral-800">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-neutral-400" />
                <Label className="text-neutral-300 font-medium">
                  Global Check Interval
                </Label>
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                How often QStash triggers monitor checks (applies to all
                monitors)
              </p>
              {cronLoading ? (
                <div className="flex items-center gap-2 text-neutral-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading schedule...
                </div>
              ) : cronSchedule ? (
                <div className="flex items-center gap-3">
                  <Select
                    value={String(cronSchedule.intervalMinutes)}
                    onValueChange={handleCronIntervalChange}
                    disabled={cronSaving}
                  >
                    <SelectTrigger className="w-[200px] bg-neutral-800 border-neutral-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRON_INTERVAL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cronSaving && (
                    <Loader2 className="h-4 w-4 animate-spin text-green-400" />
                  )}
                  {cronSchedule.isPaused && (
                    <span className="text-xs text-yellow-400 bg-yellow-500/20 px-2 py-1 rounded">
                      Paused
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">
                  No QStash schedule configured
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notification Channels */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-400" />
              Notification Channels
            </CardTitle>
            <CardDescription>
              Select which channels should receive alerts for this monitor
            </CardDescription>
          </CardHeader>
          <CardContent>
            {channelsLoading ? (
              <div className="flex items-center gap-2 text-neutral-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading channels...
              </div>
            ) : channels.length === 0 ? (
              <div className="text-center py-6">
                <Bell className="h-8 w-8 text-neutral-600 mx-auto mb-2" />
                <p className="text-neutral-400 text-sm mb-3">
                  No notification channels configured
                </p>
                <Link href="/dashboard/notifications/new">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neutral-700"
                  >
                    Add Channel
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {channels.map((channel) => {
                  const isSelected = selectedChannels.includes(channel.id);
                  const iconConfig: Record<
                    string,
                    { icon: typeof Bell; color: string; bg: string }
                  > = {
                    telegram: {
                      icon: MessageCircle,
                      color: "text-blue-400",
                      bg: "bg-blue-500/20",
                    },
                    discord: {
                      icon: MessageCircle,
                      color: "text-indigo-400",
                      bg: "bg-indigo-500/20",
                    },
                    slack: {
                      icon: MessageCircle,
                      color: "text-amber-400",
                      bg: "bg-amber-500/20",
                    },
                    teams: {
                      icon: MessageCircle,
                      color: "text-violet-400",
                      bg: "bg-violet-500/20",
                    },
                    email: {
                      icon: Mail,
                      color: "text-emerald-400",
                      bg: "bg-emerald-500/20",
                    },
                    webhook: {
                      icon: Webhook,
                      color: "text-neutral-400",
                      bg: "bg-neutral-500/20",
                    },
                    pushover: {
                      icon: Bell,
                      color: "text-cyan-400",
                      bg: "bg-cyan-500/20",
                    },
                  };
                  const config = iconConfig[channel.type] || iconConfig.webhook;
                  const Icon = config.icon;

                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannels((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== channel.id)
                            : [...prev, channel.id],
                        );
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        isSelected
                          ? "border-green-500 bg-green-500/10"
                          : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p
                          className={`font-medium ${isSelected ? "text-green-400" : "text-white"}`}
                        >
                          {channel.name}
                        </p>
                        <p className="text-xs text-neutral-500 capitalize">
                          {channel.type}
                        </p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-green-500 bg-green-500"
                            : "border-neutral-600"
                        }`}
                      >
                        {isSelected && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={saving || success}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
          <Link href={`/dashboard/monitors/${params.id}`}>
            <Button
              type="button"
              variant="outline"
              className="border-neutral-700 hover:bg-neutral-800"
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="border-red-800 text-red-400 hover:bg-red-950"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
