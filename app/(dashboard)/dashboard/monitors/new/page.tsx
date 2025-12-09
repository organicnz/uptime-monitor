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
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import Link from "next/link";

const monitorTypes = [
  {
    id: "http",
    name: "HTTP(s)",
    description: "Check if a URL returns a successful response",
    icon: Globe,
    color: "text-blue-400",
    bg: "bg-blue-500/20",
  },
  {
    id: "keyword",
    name: "Keyword",
    description: "Check if a URL contains a specific keyword",
    icon: Search,
    color: "text-purple-400",
    bg: "bg-purple-500/20",
  },
  {
    id: "tcp",
    name: "TCP Port",
    description: "Check if a TCP port is open",
    icon: Server,
    color: "text-orange-400",
    bg: "bg-orange-500/20",
  },
  {
    id: "ping",
    name: "Ping",
    description: "Check if a host responds to ping",
    icon: Zap,
    color: "text-green-400",
    bg: "bg-green-500/20",
  },
  {
    id: "dns",
    name: "DNS",
    description: "Check DNS resolution for a hostname",
    icon: Radio,
    color: "text-cyan-400",
    bg: "bg-cyan-500/20",
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/monitors"
          className="inline-flex items-center text-sm text-neutral-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Monitors
        </Link>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
          Create New Monitor
        </h1>
        <p className="text-neutral-400 mt-1">
          Set up monitoring for your services
        </p>
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
          Monitor created successfully! Redirecting...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Monitor Type Selection */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white">Monitor Type</CardTitle>
            <CardDescription>
              Choose what kind of check to perform
            </CardDescription>
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
                    <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">
                      {type.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Basic Configuration */}
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
            <CardDescription>
              Configure your {selectedType?.name} monitor
            </CardDescription>
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
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="My Website"
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

            {/* URL field for HTTP/Keyword */}
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
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="https://example.com"
                />
              </div>
            )}

            {/* Keyword field */}
            {formData.type === "keyword" && (
              <div>
                <Label htmlFor="keyword" className="text-neutral-300">
                  Keyword to Find *
                </Label>
                <input
                  id="keyword"
                  type="text"
                  required
                  value={formData.keyword}
                  onChange={(e) => updateField("keyword", e.target.value)}
                  className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="Welcome, OK, Success..."
                />
                <p className="mt-1.5 text-xs text-neutral-500">
                  The monitor will be marked UP only if this keyword is found in
                  the response
                </p>
              </div>
            )}

            {/* Hostname field for TCP/Ping/DNS */}
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
                    className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="example.com or 192.168.1.1"
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
                      className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="443"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <Label htmlFor="description" className="text-neutral-300">
                Description (optional)
              </Label>
              <textarea
                id="description"
                rows={2}
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-white placeholder:text-neutral-500 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                placeholder="Add notes about this monitor..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Advanced Settings */}
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white">Advanced Settings</CardTitle>
            <CardDescription>Fine-tune check behavior</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="interval" className="text-neutral-300">
                  Check Interval
                </Label>
                <div className="mt-1.5 relative">
                  <input
                    id="interval"
                    type="number"
                    min="60"
                    max="3600"
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
            <p className="mt-3 text-xs text-neutral-500">
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
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
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
            <Button
              type="button"
              variant="outline"
              className="border-neutral-700 hover:bg-neutral-800"
            >
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
