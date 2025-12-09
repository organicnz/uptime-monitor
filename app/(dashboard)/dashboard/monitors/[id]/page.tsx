import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function MonitorDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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

  const { data: monitorData } = await supabase
    .from("monitors")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!monitorData) {
    notFound();
  }

  const monitor = monitorData as Monitor;

  type Heartbeat = {
    id: string;
    monitor_id: string;
    status: number;
    msg: string | null;
    ping: number | null;
    duration: number | null;
    time: string;
  };

  const { data: heartbeatsData } = await supabase
    .from("heartbeats")
    .select("*")
    .eq("monitor_id", params.id)
    .order("time", { ascending: false })
    .limit(100);

  const heartbeats = (heartbeatsData || []) as Heartbeat[];

  // Calculate stats
  const uptimeStats =
    heartbeats.length > 0
      ? {
          total: heartbeats.length,
          up: heartbeats.filter((h) => h.status === 1).length,
          down: heartbeats.filter((h) => h.status === 0).length,
          percentage: (
            (heartbeats.filter((h) => h.status === 1).length /
              heartbeats.length) *
            100
          ).toFixed(2),
        }
      : { total: 0, up: 0, down: 0, percentage: "0.00" };

  const validPings = heartbeats.filter((h) => h.ping !== null && h.ping > 0);
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

  const latestHeartbeat = heartbeats[0];
  const currentStatus = latestHeartbeat
    ? latestHeartbeat.status === 1
      ? "up"
      : latestHeartbeat.status === 0
        ? "down"
        : "pending"
    : "pending";

  type Incident = {
    id: string;
    monitor_id: string;
    title: string;
    content: string | null;
    status: number;
    started_at: string;
    resolved_at: string | null;
  };

  const { data: incidentsData } = await supabase
    .from("incidents")
    .select("*")
    .eq("monitor_id", params.id)
    .eq("status", 0)
    .order("started_at", { ascending: false });

  const activeIncidents = (incidentsData || []) as Incident[];

  const statusConfig = {
    up: {
      icon: CheckCircle2,
      color: "text-green-400",
      bg: "bg-green-500/20",
      label: "Operational",
      gradient: "from-green-500/20 to-emerald-500/10",
    },
    down: {
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-500/20",
      label: "Down",
      gradient: "from-red-500/20 to-orange-500/10",
    },
    pending: {
      icon: AlertTriangle,
      color: "text-neutral-400",
      bg: "bg-neutral-500/20",
      label: "Pending",
      gradient: "from-neutral-500/20 to-neutral-500/10",
    },
  };

  const typeIcons: Record<string, typeof Globe> = {
    http: Globe,
    https: Shield,
    tcp: Server,
    ping: Zap,
    keyword: Globe,
    dns: Server,
  };

  const TypeIcon = typeIcons[monitor.type] || Globe;
  const StatusIcon = statusConfig[currentStatus].icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/monitors"
          className="inline-flex items-center text-sm text-neutral-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Monitors
        </Link>

        {/* Status Banner */}
        <div
          className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${statusConfig[currentStatus].gradient} border border-neutral-800 p-6 mb-6`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`relative p-4 rounded-xl ${statusConfig[currentStatus].bg}`}
              >
                <StatusIcon
                  className={`h-8 w-8 ${statusConfig[currentStatus].color}`}
                />
                {currentStatus === "up" && (
                  <span className="absolute top-1 right-1 h-3 w-3 bg-green-400 rounded-full animate-pulse" />
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">
                  {monitor.name}
                </h1>
                <div className="flex items-center gap-3 text-neutral-400">
                  <span className="flex items-center gap-1.5">
                    <TypeIcon className="h-4 w-4" />
                    {monitor.type.toUpperCase()}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    Every {monitor.interval}s
                  </span>
                  {monitor.url && (
                    <>
                      <span>•</span>
                      <a
                        href={monitor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-green-400 transition-colors"
                      >
                        {new URL(monitor.url).hostname}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-neutral-700 hover:bg-neutral-800"
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
                  size="sm"
                  className="border-neutral-700 hover:bg-neutral-800"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Status Badge */}
          <div className="absolute top-6 right-6">
            <span
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold ${statusConfig[currentStatus].bg} ${statusConfig[currentStatus].color}`}
            >
              <StatusIcon className="h-4 w-4" />
              {statusConfig[currentStatus].label}
            </span>
          </div>
        </div>
      </div>

      {/* Active Incidents */}
      {activeIncidents.length > 0 && (
        <Card className="bg-red-950/50 border-red-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Active Incident
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeIncidents.map((incident) => (
              <div key={incident.id}>
                <p className="font-medium text-red-200">{incident.title}</p>
                <p className="text-sm text-red-400 mt-1">
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Uptime</p>
                <p className="text-3xl font-bold text-green-400">
                  {uptimeStats.percentage}%
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {uptimeStats.up}/{uptimeStats.total} checks
                </p>
              </div>
              <div className="p-3 bg-green-500/20 rounded-xl">
                <TrendingUp className="h-6 w-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Avg Response</p>
                <p className="text-3xl font-bold text-white">
                  {avgPing}
                  <span className="text-lg text-neutral-400">ms</span>
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {minPing}ms - {maxPing}ms
                </p>
              </div>
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Zap className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Incidents</p>
                <p className="text-3xl font-bold text-white">
                  {activeIncidents.length}
                </p>
                <p className="text-xs text-neutral-500 mt-1">Active now</p>
              </div>
              <div
                className={`p-3 rounded-xl ${activeIncidents.length > 0 ? "bg-red-500/20" : "bg-neutral-500/20"}`}
              >
                <AlertTriangle
                  className={`h-6 w-6 ${activeIncidents.length > 0 ? "text-red-400" : "text-neutral-400"}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Last Check</p>
                <p className="text-xl font-bold text-white">
                  {latestHeartbeat
                    ? formatDistanceToNow(new Date(latestHeartbeat.time), {
                        addSuffix: true,
                      })
                    : "Never"}
                </p>
                <p className="text-xs text-neutral-500 mt-1">
                  {latestHeartbeat?.ping
                    ? `${latestHeartbeat.ping}ms`
                    : "No data"}
                </p>
              </div>
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Clock className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Response Time Chart */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-green-400" />
            Response Time
          </CardTitle>
          <CardDescription>Last 50 checks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-40 flex items-end gap-1">
            {heartbeats
              .slice(0, 50)
              .reverse()
              .map((hb, i) => {
                const maxHeight = 140;
                const height = hb.ping
                  ? Math.max(
                      8,
                      Math.min(
                        maxHeight,
                        (hb.ping / (maxPing || 1)) * maxHeight,
                      ),
                    )
                  : 8;
                const color =
                  hb.status === 1
                    ? hb.ping && hb.ping > avgPing * 1.5
                      ? "bg-yellow-500"
                      : "bg-green-500"
                    : hb.status === 0
                      ? "bg-red-500"
                      : "bg-neutral-600";

                return (
                  <div
                    key={hb.id || i}
                    className="flex-1 flex flex-col justify-end group relative"
                  >
                    <div
                      className={`w-full rounded-t ${color} transition-all hover:opacity-80`}
                      style={{ height: `${height}px` }}
                    />
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                      {hb.ping ? `${hb.ping}ms` : "N/A"}
                      <br />
                      {new Date(hb.time).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            {heartbeats.length === 0 &&
              Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end">
                  <div className="w-full h-8 bg-neutral-700/50 rounded-t animate-pulse" />
                </div>
              ))}
          </div>
          <div className="flex justify-between mt-2 text-xs text-neutral-500">
            <span>Oldest</span>
            <span>Latest</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent Checks */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-white">Recent Checks</CardTitle>
          <CardDescription>Latest heartbeat data</CardDescription>
        </CardHeader>
        <CardContent>
          {heartbeats.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {heartbeats.slice(0, 20).map((heartbeat) => {
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
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50 hover:border-neutral-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-1.5 rounded-lg ${statusConfig[status].bg}`}
                      >
                        <Icon
                          className={`h-4 w-4 ${statusConfig[status].color}`}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {heartbeat.msg || (status === "up" ? "OK" : "Failed")}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatDistanceToNow(new Date(heartbeat.time), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    {heartbeat.ping && (
                      <span className="text-sm font-medium text-green-400">
                        {heartbeat.ping}ms
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-400">No checks yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="text-white">Configuration</CardTitle>
          <CardDescription>Monitor settings</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-800/50 p-3 rounded-lg">
              <dt className="text-xs text-neutral-500 mb-1">Type</dt>
              <dd className="text-sm font-medium text-white capitalize">
                {monitor.type}
              </dd>
            </div>
            {monitor.url && (
              <div className="bg-neutral-800/50 p-3 rounded-lg col-span-2">
                <dt className="text-xs text-neutral-500 mb-1">URL</dt>
                <dd className="text-sm font-medium text-white truncate">
                  {monitor.url}
                </dd>
              </div>
            )}
            {monitor.hostname && (
              <div className="bg-neutral-800/50 p-3 rounded-lg">
                <dt className="text-xs text-neutral-500 mb-1">Hostname</dt>
                <dd className="text-sm font-medium text-white">
                  {monitor.hostname}
                </dd>
              </div>
            )}
            {monitor.port && (
              <div className="bg-neutral-800/50 p-3 rounded-lg">
                <dt className="text-xs text-neutral-500 mb-1">Port</dt>
                <dd className="text-sm font-medium text-white">
                  {monitor.port}
                </dd>
              </div>
            )}
            <div className="bg-neutral-800/50 p-3 rounded-lg">
              <dt className="text-xs text-neutral-500 mb-1">Timeout</dt>
              <dd className="text-sm font-medium text-white">
                {monitor.timeout}s
              </dd>
            </div>
            <div className="bg-neutral-800/50 p-3 rounded-lg">
              <dt className="text-xs text-neutral-500 mb-1">Retries</dt>
              <dd className="text-sm font-medium text-white">
                {monitor.max_retries}
              </dd>
            </div>
            <div className="bg-neutral-800/50 p-3 rounded-lg">
              <dt className="text-xs text-neutral-500 mb-1">Created</dt>
              <dd className="text-sm font-medium text-white">
                {new Date(monitor.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
          {monitor.description && (
            <div className="mt-4 bg-neutral-800/50 p-3 rounded-lg">
              <dt className="text-xs text-neutral-500 mb-1">Description</dt>
              <dd className="text-sm text-neutral-300">
                {monitor.description}
              </dd>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
