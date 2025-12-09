import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  TrendingUp,
  Zap,
  Globe,
  Server,
  Shield,
  ArrowUpRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
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
    url: string | null;
    hostname: string | null;
    method: string | null;
    active: boolean;
    type: string;
    interval: number;
    created_at: string;
    updated_at: string;
  };

  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const monitors = (monitorsData || []) as Monitor[];

  // Fetch recent heartbeats (last 24 hours)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  type Heartbeat = {
    id: string;
    monitor_id: string;
    status: number;
    ping: number | null;
    msg: string | null;
    time: string;
  };

  const { data: recentChecksData } = await supabase
    .from("heartbeats")
    .select("*, monitors!inner(user_id)")
    .eq("monitors.user_id", user.id)
    .gte("time", yesterday.toISOString())
    .order("time", { ascending: false })
    .limit(500);

  const recentHeartbeats = (recentChecksData || []) as unknown as Heartbeat[];

  // Get latest heartbeat per monitor
  const latestByMonitor = new Map<string, Heartbeat>();
  recentHeartbeats.forEach((hb) => {
    if (!latestByMonitor.has(hb.monitor_id)) {
      latestByMonitor.set(hb.monitor_id, hb);
    }
  });

  // Calculate stats
  const upMonitors = monitors.filter((m) => {
    const hb = latestByMonitor.get(m.id);
    return hb && hb.status === 1;
  }).length;

  const downMonitors = monitors.filter((m) => {
    const hb = latestByMonitor.get(m.id);
    return hb && hb.status === 0;
  }).length;

  const uptimePercentage =
    recentHeartbeats.length > 0
      ? (
          (recentHeartbeats.filter((h) => h.status === 1).length /
            recentHeartbeats.length) *
          100
        ).toFixed(1)
      : "0.0";

  const validPings = recentHeartbeats.filter(
    (c) => c.ping !== null && c.ping > 0,
  );
  const avgResponseTime = validPings.length
    ? Math.round(
        validPings.reduce((sum, check) => sum + (check.ping || 0), 0) /
          validPings.length,
      )
    : 0;

  type Incident = {
    id: string;
    monitor_id: string;
    title: string;
    status: number;
    started_at: string;
    resolved_at: string | null;
    monitors: { user_id: string; name: string };
  };

  const { data: incidentsData } = await supabase
    .from("incidents")
    .select("*, monitors!inner(user_id, name)")
    .eq("monitors.user_id", user.id)
    .eq("status", 0)
    .order("started_at", { ascending: false });

  const activeIncidents = (incidentsData || []) as Incident[];

  const typeIcons: Record<string, typeof Globe> = {
    http: Globe,
    https: Shield,
    tcp: Server,
    ping: Zap,
    keyword: Globe,
    dns: Server,
  };

  const getMonitorStatus = (monitorId: string) => {
    const hb = latestByMonitor.get(monitorId);
    if (!hb)
      return {
        status: "pending",
        color: "text-neutral-400",
        bg: "bg-neutral-500/20",
        icon: AlertTriangle,
        label: "Pending",
      };

    if (hb.status === 1)
      return {
        status: "up",
        color: "text-green-400",
        bg: "bg-green-500/20",
        icon: CheckCircle2,
        label: "Up",
        ping: hb.ping,
      };

    if (hb.status === 0)
      return {
        status: "down",
        color: "text-red-400",
        bg: "bg-red-500/20",
        icon: XCircle,
        label: "Down",
      };

    return {
      status: "pending",
      color: "text-neutral-400",
      bg: "bg-neutral-500/20",
      icon: AlertTriangle,
      label: "Pending",
    };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-neutral-400 mt-1">
            Welcome back! Here&apos;s your uptime overview.
          </p>
        </div>
        <Link href="/dashboard/monitors/new">
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Monitor
          </Button>
        </Link>
      </div>

      {/* Active Incidents Banner */}
      {activeIncidents.length > 0 && (
        <Card className="border-red-800 bg-gradient-to-r from-red-950/50 to-orange-950/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-200">
                    {activeIncidents.length} Active Incident
                    {activeIncidents.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-red-400">
                    {activeIncidents.map((i) => i.monitors.name).join(", ")}{" "}
                    experiencing issues
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/monitors/${activeIncidents[0].monitor_id}`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-700 text-red-300 hover:bg-red-900/50"
                >
                  View Details
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Total</p>
                <p className="text-3xl font-bold text-white">
                  {monitors.length}
                </p>
              </div>
              <div className="p-3 bg-blue-500/20 rounded-xl">
                <Activity className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Up</p>
                <p className="text-3xl font-bold text-green-400">
                  {upMonitors}
                </p>
              </div>
              <div className="p-3 bg-green-500/20 rounded-xl">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Down</p>
                <p className="text-3xl font-bold text-red-400">
                  {downMonitors}
                </p>
              </div>
              <div className="p-3 bg-red-500/20 rounded-xl">
                <XCircle className="h-6 w-6 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Uptime (24h)</p>
                <p className="text-3xl font-bold text-green-400">
                  {uptimePercentage}%
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
                  {avgResponseTime}
                  <span className="text-lg text-neutral-500">ms</span>
                </p>
              </div>
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Zap className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitors Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Your Monitors</h2>
          <Link
            href="/dashboard/monitors"
            className="text-sm text-green-400 hover:text-green-300"
          >
            View all →
          </Link>
        </div>

        {monitors.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {monitors.slice(0, 9).map((monitor) => {
              const status = getMonitorStatus(monitor.id);
              const StatusIcon = status.icon;
              const TypeIcon = typeIcons[monitor.type] || Globe;
              const latestHb = latestByMonitor.get(monitor.id);

              return (
                <Link
                  key={monitor.id}
                  href={`/dashboard/monitors/${monitor.id}`}
                >
                  <Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 hover:bg-neutral-800/50 transition-all cursor-pointer group h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className={`relative p-2 rounded-xl ${status.bg}`}>
                          <StatusIcon className={`h-5 w-5 ${status.color}`} />
                          {status.status === "up" && (
                            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-400 rounded-full animate-pulse" />
                          )}
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-neutral-600 group-hover:text-green-400 transition-colors" />
                      </div>

                      <h3 className="font-semibold text-white group-hover:text-green-400 transition-colors truncate mb-1">
                        {monitor.name}
                      </h3>

                      <p className="text-sm text-neutral-400 truncate mb-3">
                        {monitor.url || monitor.hostname || "No endpoint"}
                      </p>

                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <div className="flex items-center gap-1.5">
                          <TypeIcon className="h-3 w-3" />
                          <span className="uppercase">{monitor.type}</span>
                        </div>
                        {latestHb?.ping && (
                          <span className="text-green-400 font-medium">
                            {latestHb.ping}ms
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card className="bg-neutral-900/50 border-neutral-800">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-green-500/20 rounded-2xl mb-4">
                <Activity className="h-12 w-12 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">
                No monitors yet
              </h3>
              <p className="text-neutral-400 mb-6 text-center max-w-md">
                Create your first monitor to start tracking uptime and
                performance.
              </p>
              <Link href="/dashboard/monitors/new">
                <Button className="bg-green-600 hover:bg-green-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Monitor
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activity */}
      {recentHeartbeats.length > 0 && (
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Activity</CardTitle>
            <CardDescription>
              Latest health checks across all monitors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentHeartbeats.slice(0, 10).map((hb) => {
                const monitor = monitors.find((m) => m.id === hb.monitor_id);
                if (!monitor) return null;

                const Icon =
                  hb.status === 1
                    ? CheckCircle2
                    : hb.status === 0
                      ? XCircle
                      : AlertTriangle;
                const color =
                  hb.status === 1
                    ? "text-green-400"
                    : hb.status === 0
                      ? "text-red-400"
                      : "text-neutral-400";
                const bg =
                  hb.status === 1
                    ? "bg-green-500/20"
                    : hb.status === 0
                      ? "bg-red-500/20"
                      : "bg-neutral-500/20";

                return (
                  <div
                    key={hb.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/50 border border-neutral-700/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${bg}`}>
                        <Icon className={`h-3.5 w-3.5 ${color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {monitor.name}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {formatDistanceToNow(new Date(hb.time), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    {hb.ping && (
                      <span className="text-sm text-green-400">
                        {hb.ping}ms
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
