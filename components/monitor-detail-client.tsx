"use client";

import { differenceInDays, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  TrendingUp,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import { GPUResponseChart } from "@/components/gpu-response-chart-client";
import { ResponseTimeChart } from "@/components/response-time-chart";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { duplicateMonitor } from "@/lib/actions/monitors";
import {
  ApiError,
  fetchJson,
  MonitorCheckResponseSchema,
} from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  url: string | null;
  hostname: string | null;
  port: number | null;
  method: string | null;
  interval: number;
  timeout: number;
  max_retries: number;
  active: boolean;
  description: string | null;
  ssl_expiry: string | null;
  ssl_issuer: string | null;
  created_at: string;
  updated_at: string;
};

type Heartbeat = {
  id: string;
  monitor_id: string;
  status: number;
  msg: string | null;
  ping: number | null;
  duration: number | null;
  time: string;
};

type Incident = {
  id: string;
  monitor_id: string;
  title: string;
  content: string | null;
  status: number;
  started_at: string;
  resolved_at: string | null;
};

type MonitorDetailClientProps = {
  monitor: Monitor;
  initialHeartbeats: Heartbeat[];
  activeIncidents: Incident[];
};

const statusConfig = {
  up: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    label: "Operational",
  },
  down: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    label: "Down",
  },
  pending: {
    icon: AlertTriangle,
    color: "text-muted-foreground",
    bg: "bg-muted",
    border: "border-border",
    label: "Pending",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    label: "Degraded",
  },
  maintenance: {
    icon: AlertTriangle,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    label: "Maintenance",
  },
};

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  https: Shield,
  tcp: Server,
  ping: Zap,
  keyword: Search,
  dns: Radio,
};

export function MonitorDetailClient({
  monitor: initialMonitor,
  initialHeartbeats,
  activeIncidents,
}: MonitorDetailClientProps) {
  const router = useRouter();
  const [monitor, setMonitor] = useState(initialMonitor);
  const [isDuplicating, startDuplicateTransition] = useTransition();
  const { heartbeats: realtimeHeartbeats, isConnected } = useRealtimeMonitor(
    monitor.id,
  );

  const displayHeartbeats =
    realtimeHeartbeats.length > 0 ? realtimeHeartbeats : initialHeartbeats;

  const uptimeStats =
    displayHeartbeats.length > 0
      ? {
          total: displayHeartbeats.length,
          up: displayHeartbeats.filter((h) => h.status === 1).length,
          percentage: (
            (displayHeartbeats.filter((h) => h.status === 1).length /
              displayHeartbeats.length) *
            100
          ).toFixed(2),
        }
      : { total: 0, up: 0, percentage: "100.00" };

  const validPings = displayHeartbeats.filter(
    (h) => h.ping !== null && h.ping > 0,
  );
  const avgPing =
    validPings.length > 0
      ? Math.round(
          validPings.reduce((sum, h) => sum + (h.ping || 0), 0) /
            validPings.length,
        )
      : 0;
  const minPing =
    validPings.length > 0 ? Math.min(...validPings.map((h) => h.ping || 0)) : 0;
  const maxPing =
    validPings.length > 0 ? Math.max(...validPings.map((h) => h.ping || 0)) : 0;

  const latestHeartbeat = displayHeartbeats[0];
  const currentStatus = latestHeartbeat
    ? latestHeartbeat.status === 1
      ? "up"
      : latestHeartbeat.status === 0
        ? "down"
        : latestHeartbeat.status === 4
          ? "degraded"
          : latestHeartbeat.status === 3
            ? "maintenance"
            : "pending"
    : "pending";

  // Calculate SSL days remaining using date-fns (avoids impure Date.now during render)
  const sslDaysRemaining = monitor.ssl_expiry
    ? differenceInDays(new Date(monitor.ssl_expiry), new Date())
    : null;

  const supabase = createClient();

  const toggleActive = async () => {
    const newState = !monitor.active;
    const { error } = await supabase
      .from("monitors")
      .update({ active: newState } as never)
      .eq("id", monitor.id);
    if (!error) {
      setMonitor((prev) => ({ ...prev, active: newState }));
    }
  };

  const [isChecking, setIsChecking] = useState(false);

  const triggerManualCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      await fetchJson(
        `/api/monitors/${monitor.id}/check`,
        MonitorCheckResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        },
      );
      toast.success("Check triggered", {
        description: "Monitor check has been queued.",
      });
    } catch (err) {
      toast.error("Check failed", {
        // An ApiError carries the route's own message; anything else is the
        // request never reaching the server.
        description:
          err instanceof ApiError
            ? err.message
            : "Network error while triggering check.",
      });
    } finally {
      setIsChecking(false);
    }
  }, [monitor.id]);

  const handleDuplicate = () => {
    startDuplicateTransition(async () => {
      const result = await duplicateMonitor(monitor.id);
      if (result.success) {
        toast.success(`Created "${result.name}"`, {
          description:
            "The duplicate is paused. Review settings before activating.",
          action: {
            label: "View",
            onClick: () => router.push(`/dashboard/monitors/${result.id}`),
          },
        });
        router.push(`/dashboard/monitors/${result.id}`);
      } else {
        toast.error("Failed to duplicate", {
          description: result.error,
        });
      }
    });
  };

  const TypeIcon = typeIcons[monitor.type] || Globe;
  const StatusIcon = statusConfig[currentStatus].icon;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/dashboard/monitors"
            className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Monitors
          </Link>
          <div className="flex items-center gap-2 text-xs">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-500">
                <Wifi className="h-3.5 w-3.5" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <WifiOff className="h-3.5 w-3.5" />
                Connecting...
              </span>
            )}
          </div>
        </div>

        <Card
          className={cn(
            "glass-card overflow-hidden transition-all duration-500",
            statusConfig[currentStatus].border,
            currentStatus === "up" && "status-glow-up",
            currentStatus === "down" && "status-glow-down",
          )}
        >
          <CardContent className="p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "relative rounded-2xl p-4",
                    statusConfig[currentStatus].bg,
                  )}
                >
                  <StatusIcon
                    className={cn("h-8 w-8", statusConfig[currentStatus].color)}
                  />
                  {currentStatus === "up" && (
                    <span className="absolute top-2 right-2 h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                  )}
                </div>
                <div>
                  <h1 className="mb-1 text-2xl font-bold sm:text-3xl">
                    {monitor.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <TypeIcon className="h-4 w-4" />
                      {monitor.type.toUpperCase()}
                    </span>
                    <span className="hidden sm:inline">•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      Every {monitor.interval}s
                    </span>
                    {monitor.url && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <a
                          href={monitor.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 transition-colors hover:text-primary"
                        >
                          {new URL(monitor.url).hostname}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold",
                    statusConfig[currentStatus].bg,
                    statusConfig[currentStatus].color,
                  )}
                >
                  <StatusIcon className="h-4 w-4" />
                  {statusConfig[currentStatus].label}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={triggerManualCheck}
                  disabled={isChecking}
                  title="Check now"
                >
                  {isChecking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" onClick={toggleActive}>
                  {monitor.active ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleDuplicate}
                  disabled={isDuplicating}
                  title="Duplicate monitor"
                >
                  {isDuplicating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Link href={`/dashboard/monitors/${monitor.id}/edit`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Settings</span>
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {activeIncidents.length > 0 && (
        <Card className="status-glow-down border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Active Incident
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeIncidents.map((incident) => (
              <div key={incident.id}>
                <p className="font-medium">{incident.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Started{" "}
                  {formatDistanceToNow(new Date(incident.started_at), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Uptime</p>
                <p className="text-3xl font-bold text-emerald-500">
                  {uptimeStats.percentage}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {uptimeStats.up}/{uptimeStats.total} checks
                </p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-3">
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Response</p>
                <p className="text-3xl font-bold">
                  {avgPing}
                  <span className="text-lg text-muted-foreground">ms</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {minPing}ms - {maxPing}ms
                </p>
              </div>
              <div className="rounded-xl bg-blue-500/10 p-3">
                <Zap className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Incidents</p>
                <p className="text-3xl font-bold">{activeIncidents.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Active now</p>
              </div>
              <div
                className={cn(
                  "rounded-xl p-3",
                  activeIncidents.length > 0 ? "bg-red-500/10" : "bg-muted",
                )}
              >
                <AlertTriangle
                  className={cn(
                    "h-6 w-6",
                    activeIncidents.length > 0
                      ? "text-red-500"
                      : "text-muted-foreground",
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Last Check</p>
                <p className="text-xl font-bold">
                  {latestHeartbeat
                    ? formatDistanceToNow(new Date(latestHeartbeat.time), {
                        addSuffix: true,
                      })
                    : "Never"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestHeartbeat?.ping
                    ? `${latestHeartbeat.ping}ms`
                    : "No data"}
                </p>
              </div>
              <div className="rounded-xl bg-purple-500/10 p-3">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        {/* SSL Certificate Info Card - only for HTTPS monitors */}
        {monitor.url?.startsWith("https://") && (
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    SSL Certificate
                  </p>
                  {sslDaysRemaining !== null ? (
                    <>
                      <p
                        className={cn(
                          "text-xl font-bold",
                          sslDaysRemaining <= 7
                            ? "text-red-500"
                            : sslDaysRemaining <= 30
                              ? "text-amber-500"
                              : "text-emerald-500",
                        )}
                      >
                        {sslDaysRemaining} days
                      </p>
                      <p className="mt-1 max-w-[150px] truncate text-xs text-muted-foreground">
                        {monitor.ssl_issuer || "Unknown issuer"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-bold text-muted-foreground">
                        Checking...
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pending first check
                      </p>
                    </>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-xl p-3",
                    sslDaysRemaining === null
                      ? "bg-muted"
                      : sslDaysRemaining <= 7
                        ? "bg-red-500/10"
                        : sslDaysRemaining <= 30
                          ? "bg-amber-500/10"
                          : "bg-emerald-500/10",
                  )}
                >
                  <Shield
                    className={cn(
                      "h-6 w-6",
                      sslDaysRemaining === null
                        ? "text-muted-foreground"
                        : sslDaysRemaining <= 7
                          ? "text-red-500"
                          : sslDaysRemaining <= 30
                            ? "text-amber-500"
                            : "text-emerald-500",
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="glass-card">
        <CardHeader className="pt-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Response Time
            </CardTitle>
            <CardDescription className="text-xs">
              Last 50 checks
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex h-12 items-end gap-px">
            {displayHeartbeats
              .slice(0, 50)
              .reverse()
              .map((hb, i) => {
                const maxHeight = 44;
                const height = hb.ping
                  ? Math.max(
                      3,
                      Math.min(
                        maxHeight,
                        (hb.ping / (maxPing || 800)) * maxHeight,
                      ),
                    )
                  : 3;
                const isUp = hb.status === 1;
                const isDown = hb.status === 0;
                const isSlow = hb.ping && hb.ping > avgPing * 1.5;
                return (
                  <div
                    key={hb.id || i}
                    className="group relative flex flex-1 flex-col justify-end"
                  >
                    <div
                      className={cn(
                        "w-full rounded-sm transition-all hover:opacity-80",
                        isUp
                          ? isSlow
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                          : isDown
                            ? "bg-red-500"
                            : "bg-muted-foreground",
                      )}
                      style={{ height: `${height}px` }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {hb.ping ? `${hb.ping}ms` : "N/A"}
                      <br />
                      {new Date(hb.time).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            {displayHeartbeats.length === 0 &&
              Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="flex flex-1 flex-col justify-end">
                  <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
                </div>
              ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </CardContent>
      </Card>

      {/* GPU-accelerated trend */}
      <Card className="glass-card">
        <CardHeader className="pt-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Latency Trend
            </CardTitle>
            <CardDescription className="text-xs">
              WebGPU when available
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <GPUResponseChart
            points={displayHeartbeats.map((hb) => ({
              ping: hb.ping,
              status: hb.status,
            }))}
          />
        </CardContent>
      </Card>

      {/* Interactive Response Time Chart */}
      <ResponseTimeChart
        heartbeats={displayHeartbeats}
        monitorId={monitor.id}
      />

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Checks</CardTitle>
          <CardDescription>Latest heartbeat data</CardDescription>
        </CardHeader>
        <CardContent>
          {displayHeartbeats.length > 0 ? (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {displayHeartbeats.slice(0, 20).map((heartbeat) => {
                const status =
                  heartbeat.status === 1
                    ? "up"
                    : heartbeat.status === 0
                      ? "down"
                      : heartbeat.status === 4
                        ? "degraded"
                        : heartbeat.status === 3
                          ? "maintenance"
                          : "pending";
                const Icon = statusConfig[status].icon;
                return (
                  <div
                    key={heartbeat.id}
                    className="flex items-center justify-between rounded-xl bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "rounded-lg p-1.5",
                          statusConfig[status].bg,
                        )}
                      >
                        <Icon
                          className={cn("h-4 w-4", statusConfig[status].color)}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {heartbeat.msg || (status === "up" ? "OK" : "Failed")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(heartbeat.time), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    {heartbeat.ping && (
                      <span className="text-sm font-medium text-emerald-500">
                        {heartbeat.ping}ms
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Activity className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No checks yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Monitor settings</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-muted/30 p-3">
              <dt className="mb-1 text-xs text-muted-foreground">Type</dt>
              <dd className="text-sm font-medium">
                {monitor.type.toUpperCase()}
              </dd>
            </div>
            {monitor.url && (
              <div className="col-span-2 rounded-xl bg-muted/30 p-3">
                <dt className="mb-1 text-xs text-muted-foreground">URL</dt>
                <dd className="truncate text-sm font-medium">{monitor.url}</dd>
              </div>
            )}
            {monitor.hostname && (
              <div className="rounded-xl bg-muted/30 p-3">
                <dt className="mb-1 text-xs text-muted-foreground">Hostname</dt>
                <dd className="text-sm font-medium">{monitor.hostname}</dd>
              </div>
            )}
            {monitor.port && (
              <div className="rounded-xl bg-muted/30 p-3">
                <dt className="mb-1 text-xs text-muted-foreground">Port</dt>
                <dd className="text-sm font-medium">{monitor.port}</dd>
              </div>
            )}
            <div className="rounded-xl bg-muted/30 p-3">
              <dt className="mb-1 text-xs text-muted-foreground">Timeout</dt>
              <dd className="text-sm font-medium">{monitor.timeout}s</dd>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <dt className="mb-1 text-xs text-muted-foreground">Retries</dt>
              <dd className="text-sm font-medium">{monitor.max_retries}</dd>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <dt className="mb-1 text-xs text-muted-foreground">Created</dt>
              <dd className="text-sm font-medium">
                {new Date(monitor.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          {monitor.description && (
            <div className="mt-4 rounded-xl bg-muted/30 p-3">
              <dt className="mb-1 text-xs text-muted-foreground">
                Description
              </dt>
              <dd className="text-sm">{monitor.description}</dd>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
