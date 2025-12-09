"use client";

import { useState } from "react";
import Link from "next/link";
import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { createClient } from "@/lib/supabase/client";
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
import { formatDistanceToNow } from "date-fns";
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

type Props = {
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
    border: "border",
    label: "Pending",
  },
};

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  https: Globe,
  tcp: Server,
  ping: Zap,
  keyword: Search,
  dns: Radio,
};

export function MonitorDetailClient({
  monitor: initialMonitor,
  initialHeartbeats,
  activeIncidents,
}: Props) {
  const supabase = createClient();
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
      : { total: 0, up: 0, percentage: "0.00" };

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
  const currentStatus: "up" | "down" | "pending" = latestHeartbeat
    ? latestHeartbeat.status === 1
      ? "up"
      : latestHeartbeat.status === 0
        ? "down"
        : "pending"
    : "pending";

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
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/dashboard/monitors"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Monitors
          </Link>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-emerald-500 text-sm">
                <Wifi className="h-4 w-4" />
                Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                <WifiOff className="h-4 w-4" />
                Connecting...
              </span>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <Card
          className={cn(
            "bg-neutral-900/50 border-neutral-800 overflow-hidden transition-all duration-500",
            statusConfig[currentStatus].border,
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
                          className="flex items-center gap-1 hover:text-foreground"
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
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
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
                  onClick={toggleActive}
                  className="border-neutral-800"
                >
                  {monitor.active ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
                <Link href={`/dashboard/monitors/${monitor.id}/edit`}>
                  <Button
                    variant="outline"
                    className="gap-2 border-neutral-800"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <Card className="bg-neutral-900/50 border-red-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Active Incident
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeIncidents.map((incident) => (
              <div key={incident.id}>
                <p className="font-medium">{incident.title}</p>
                <p className="text-sm text-muted-foreground">
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

      {/* Stats Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Uptime"
          value={`${uptimeStats.percentage}%`}
          subtitle={`${uptimeStats.up}/${uptimeStats.total} checks`}
          icon={TrendingUp}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          valueColor="text-emerald-500"
        />
        <StatsCard
          label="Avg Response"
          value={avgPing}
          suffix="ms"
          subtitle={`${minPing}ms - ${maxPing}ms`}
          icon={Zap}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <StatsCard
          label="Incidents"
          value={activeIncidents.length}
          subtitle="Active now"
          icon={AlertTriangle}
          iconColor={
            activeIncidents.length > 0
              ? "text-red-500"
              : "text-muted-foreground"
          }
          iconBg={activeIncidents.length > 0 ? "bg-red-500/10" : "bg-muted"}
        />
        <StatsCard
          label="Last Check"
          value={
            latestHeartbeat
              ? formatDistanceToNow(new Date(latestHeartbeat.time), {
                  addSuffix: true,
                })
              : "Never"
          }
          subtitle={latestHeartbeat?.msg || "No data"}
          icon={Clock}
          iconColor="text-purple-500"
          iconBg="bg-purple-500/10"
          smallValue
        />
      </div>

      {/* Response Time Chart */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Response Time
          </CardTitle>
          <CardDescription>Last 50 checks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-end gap-0.5">
            {displayHeartbeats
              .slice(0, 50)
              .reverse()
              .map((hb, i) => {
                const maxHeight = 140;
                const height = hb.ping
                  ? Math.max(
                      8,
                      Math.min((hb.ping / 1000) * maxHeight, maxHeight),
                    )
                  : 8;
                const isUp = hb.status === 1;
                const isDown = hb.status === 0;
                const isSlow = hb.ping && hb.ping > avgPing * 1.5;

                return (
                  <div key={hb.id || i} className="flex-1 group relative">
                    <div
                      className={cn(
                        "w-full rounded-t transition-opacity hover:opacity-80",
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
                  </div>
                );
              })}
            {displayHeartbeats.length === 0 &&
              Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <div className="w-full h-8 bg-muted rounded-t" />
                </div>
              ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Checks */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle>Recent Checks</CardTitle>
          <CardDescription>Latest heartbeat data</CardDescription>
        </CardHeader>
        <CardContent>
          {displayHeartbeats.length > 0 ? (
            <div className="space-y-2">
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
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/30"
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
                          {heartbeat.msg || statusConfig[status].label}
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
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No heartbeat data yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Monitor settings</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ConfigItem label="Type" value={monitor.type.toUpperCase()} />
            {monitor.url && (
              <ConfigItem label="URL" value={monitor.url} span={2} />
            )}
            {monitor.hostname && (
              <ConfigItem label="Hostname" value={monitor.hostname} />
            )}
            {monitor.port && (
              <ConfigItem label="Port" value={String(monitor.port)} />
            )}
            <ConfigItem label="Interval" value={`${monitor.interval}s`} />
            <ConfigItem label="Timeout" value={`${monitor.timeout}s`} />
            <ConfigItem label="Retries" value={String(monitor.max_retries)} />
            <ConfigItem
              label="Created"
              value={new Date(monitor.created_at).toLocaleDateString()}
            />
          </dl>
          {monitor.description && (
            <div className="mt-4 pt-4 border-t border-neutral-800">
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

function StatsCard({
  label,
  value,
  suffix,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  valueColor,
  smallValue,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  subtitle: string;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
  smallValue?: boolean;
}) {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{label}</p>
            <p
              className={cn(
                "font-bold",
                smallValue ? "text-xl" : "text-3xl",
                valueColor,
              )}
            >
              {value}
              {suffix && (
                <span className="text-lg text-muted-foreground ml-0.5">
                  {suffix}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
          <div className={cn("p-3 rounded-xl", iconBg)}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigItem({
  label,
  value,
  span = 1,
}: {
  label: string;
  value: string;
  span?: number;
}) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <dt className="text-xs text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm font-medium truncate">{value}</dd>
    </div>
  );
}
