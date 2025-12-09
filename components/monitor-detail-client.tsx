"use client";

import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings,
  Globe,
  Zap,
  Shield,
  Server,
  ExternalLink,
  Pause,
  Play,
  TrendingUp,
  Search,
  Radio,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
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
  const [monitor, setMonitor] = useState(initialMonitor);
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
        : "pending"
    : "pending";

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

  const TypeIcon = typeIcons[monitor.type] || Globe;
  const StatusIcon = statusConfig[currentStatus].icon;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboard/monitors"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Monitors
          </Link>
          <div className="flex items-center gap-2 text-xs">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-500">
                <Wifi className="h-3.5 w-3.5" />
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "relative p-4 rounded-2xl",
                    statusConfig[currentStatus].bg,
                  )}
                >
                  <StatusIcon
                    className={cn("h-8 w-8", statusConfig[currentStatus].color)}
                  />
                  {currentStatus === "up" && (
                    <span className="absolute top-2 right-2 h-3 w-3 bg-emerald-500 rounded-full animate-pulse" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold mb-1">
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
                          className="flex items-center gap-1 hover:text-primary transition-colors"
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
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold",
                    statusConfig[currentStatus].bg,
                    statusConfig[currentStatus].color,
                  )}
                >
                  <StatusIcon className="h-4 w-4" />
                  {statusConfig[currentStatus].label}
                </span>
                <Button variant="outline" size="icon" onClick={toggleActive}>
                  {monitor.active ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
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
        <Card className="border-destructive/50 bg-destructive/5 status-glow-down">
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
                <p className="text-sm text-muted-foreground mt-1">
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
                <p className="text-xs text-muted-foreground mt-1">
                  {uptimeStats.up}/{uptimeStats.total} checks
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10">
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
                <p className="text-xs text-muted-foreground mt-1">
                  {minPing}ms - {maxPing}ms
                </p>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
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
                <p className="text-xs text-muted-foreground mt-1">Active now</p>
              </div>
              <div
                className={cn(
                  "p-3 rounded-xl",
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
                <p className="text-xs text-muted-foreground mt-1">
                  {latestHeartbeat?.ping
                    ? `${latestHeartbeat.ping}ms`
                    : "No data"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-purple-500/10">
                <Clock className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2 pt-4">
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
          <div className="h-12 flex items-end gap-px">
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
                    className="flex-1 flex flex-col justify-end group relative"
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
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10 pointer-events-none border">
                      {hb.ping ? `${hb.ping}ms` : "N/A"}
                      <br />
                      {new Date(hb.time).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            {displayHeartbeats.length === 0 &&
              Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <div className="w-full h-3 bg-muted rounded-sm animate-pulse" />
                </div>
              ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Checks</CardTitle>
          <CardDescription>Latest heartbeat data</CardDescription>
        </CardHeader>
        <CardContent>
          {displayHeartbeats.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {displayHeartbeats.slice(0, 20).map((heartbeat) => {
                const status =
                  heartbeat.status === 1
                    ? "up"
                    : heartbeat.status === 0
                      ? "down"
                      : "pending";
                const Icon = statusConfig[status].icon;
                return (
                  <div
                    key={heartbeat.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "p-1.5 rounded-lg",
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
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
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
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-muted/30">
              <dt className="text-xs text-muted-foreground mb-1">Type</dt>
              <dd className="text-sm font-medium">
                {monitor.type.toUpperCase()}
              </dd>
            </div>
            {monitor.url && (
              <div className="p-3 rounded-xl bg-muted/30 col-span-2">
                <dt className="text-xs text-muted-foreground mb-1">URL</dt>
                <dd className="text-sm font-medium truncate">{monitor.url}</dd>
              </div>
            )}
            {monitor.hostname && (
              <div className="p-3 rounded-xl bg-muted/30">
                <dt className="text-xs text-muted-foreground mb-1">Hostname</dt>
                <dd className="text-sm font-medium">{monitor.hostname}</dd>
              </div>
            )}
            {monitor.port && (
              <div className="p-3 rounded-xl bg-muted/30">
                <dt className="text-xs text-muted-foreground mb-1">Port</dt>
                <dd className="text-sm font-medium">{monitor.port}</dd>
              </div>
            )}
            <div className="p-3 rounded-xl bg-muted/30">
              <dt className="text-xs text-muted-foreground mb-1">Timeout</dt>
              <dd className="text-sm font-medium">{monitor.timeout}s</dd>
            </div>
            <div className="p-3 rounded-xl bg-muted/30">
              <dt className="text-xs text-muted-foreground mb-1">Retries</dt>
              <dd className="text-sm font-medium">{monitor.max_retries}</dd>
            </div>
            <div className="p-3 rounded-xl bg-muted/30">
              <dt className="text-xs text-muted-foreground mb-1">Created</dt>
              <dd className="text-sm font-medium">
                {new Date(monitor.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          {monitor.description && (
            <div className="mt-4 p-3 rounded-xl bg-muted/30">
              <dt className="text-xs text-muted-foreground mb-1">
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
