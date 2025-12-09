import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Activity,
  Plus,
  Clock,
  Globe,
  Server,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowUpRight,
  Zap,
  Shield,
} from "lucide-react";

type Monitor = {
  id: string;
  user_id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  method: string | null;
  active: boolean;
  interval: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type Heartbeat = {
  id: string;
  monitor_id: string;
  status: number;
  ping: number | null;
  time: string;
};

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  https: Shield,
  tcp: Server,
  ping: Zap,
  keyword: Globe,
  dns: Server,
  docker: Server,
  steam: Server,
};

export default async function MonitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all monitors for the user
  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const monitors = (monitorsData || []) as Monitor[];

  // Fetch latest heartbeat for each monitor
  const monitorIds = monitors.map((m) => m.id);
  const { data: heartbeatsData } = await supabase
    .from("heartbeats")
    .select("*")
    .in("monitor_id", monitorIds)
    .order("time", { ascending: false });

  const heartbeats = (heartbeatsData || []) as Heartbeat[];

  // Create a map of monitor_id -> latest heartbeat
  const latestHeartbeats = new Map<string, Heartbeat>();
  heartbeats.forEach((hb) => {
    if (!latestHeartbeats.has(hb.monitor_id)) {
      latestHeartbeats.set(hb.monitor_id, hb);
    }
  });

  // Get last 24 heartbeats for each monitor (for mini chart)
  const recentHeartbeatsMap = new Map<string, Heartbeat[]>();
  monitors.forEach((m) => {
    recentHeartbeatsMap.set(
      m.id,
      heartbeats.filter((hb) => hb.monitor_id === m.id).slice(0, 24),
    );
  });

  // Stats
  const upCount = monitors.filter((m) => {
    const hb = latestHeartbeats.get(m.id);
    return hb && hb.status === 1;
  }).length;
  const downCount = monitors.filter((m) => {
    const hb = latestHeartbeats.get(m.id);
    return hb && hb.status === 0;
  }).length;
  const pendingCount = monitors.length - upCount - downCount;

  const getMonitorStatus = (
    monitorId: string,
  ): {
    status: string;
    color: string;
    bgColor: string;
    icon: typeof CheckCircle2;
  } => {
    const heartbeat = latestHeartbeats.get(monitorId);
    if (!heartbeat) {
      return {
        status: "Pending",
        color: "text-neutral-400",
        bgColor: "bg-neutral-500/20",
        icon: AlertCircle,
      };
    }
    switch (heartbeat.status) {
      case 1:
        return {
          status: "Up",
          color: "text-green-400",
          bgColor: "bg-green-500/20",
          icon: CheckCircle2,
        };
      case 0:
        return {
          status: "Down",
          color: "text-red-400",
          bgColor: "bg-red-500/20",
          icon: XCircle,
        };
      default:
        return {
          status: "Pending",
          color: "text-neutral-400",
          bgColor: "bg-neutral-500/20",
          icon: AlertCircle,
        };
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            Monitors
          </h1>
          <p className="text-neutral-400 mt-1">
            Track uptime and performance of your services
          </p>
        </div>
        <Link href="/dashboard/monitors/new">
          <Button className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            Add Monitor
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-neutral-900/50 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-400">Total Monitors</p>
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
                <p className="text-sm text-neutral-400">Operational</p>
                <p className="text-3xl font-bold text-green-400">{upCount}</p>
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
                <p className="text-3xl font-bold text-red-400">{downCount}</p>
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
                <p className="text-sm text-neutral-400">Pending</p>
                <p className="text-3xl font-bold text-neutral-400">
                  {pendingCount}
                </p>
              </div>
              <div className="p-3 bg-neutral-500/20 rounded-xl">
                <AlertCircle className="h-6 w-6 text-neutral-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monitors List */}
      {monitors.length > 0 ? (
        <div className="space-y-3">
          {monitors.map((monitor) => {
            const Icon = typeIcons[monitor.type] || Activity;
            const status = getMonitorStatus(monitor.id);
            const StatusIcon = status.icon;
            const latestHeartbeat = latestHeartbeats.get(monitor.id);
            const recentHeartbeats = recentHeartbeatsMap.get(monitor.id) || [];

            return (
              <Link
                key={monitor.id}
                href={`/dashboard/monitors/${monitor.id}`}
                className="block"
              >
                <Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer group">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      {/* Status Indicator */}
                      <div
                        className={`relative p-3 rounded-xl ${status.bgColor}`}
                      >
                        <StatusIcon className={`h-5 w-5 ${status.color}`} />
                        {status.status === "Up" && (
                          <span className="absolute top-0 right-0 h-2.5 w-2.5 bg-green-400 rounded-full animate-pulse" />
                        )}
                      </div>

                      {/* Monitor Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white group-hover:text-green-400 transition-colors truncate">
                            {monitor.name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.bgColor} ${status.color}`}
                          >
                            {status.status}
                          </span>
                          {!monitor.active && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
                              Paused
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-neutral-400">
                          <span className="flex items-center gap-1 truncate">
                            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {monitor.url || monitor.hostname || "No endpoint"}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 flex-shrink-0">
                            <Clock className="h-3.5 w-3.5" />
                            {monitor.interval}s
                          </span>
                        </div>
                      </div>

                      {/* Mini Status Chart */}
                      <div className="hidden md:flex items-center gap-0.5 h-8">
                        {recentHeartbeats
                          .slice(0, 24)
                          .reverse()
                          .map((hb, i) => (
                            <div
                              key={i}
                              className={`w-1.5 rounded-full transition-all ${
                                hb.status === 1
                                  ? "bg-green-500 h-6"
                                  : hb.status === 0
                                    ? "bg-red-500 h-6"
                                    : "bg-neutral-600 h-3"
                              }`}
                              title={new Date(hb.time).toLocaleString()}
                            />
                          ))}
                        {recentHeartbeats.length === 0 &&
                          Array.from({ length: 12 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-1.5 h-3 bg-neutral-700 rounded-full"
                            />
                          ))}
                      </div>

                      {/* Response Time */}
                      <div className="hidden sm:block text-right">
                        {latestHeartbeat?.ping ? (
                          <div>
                            <p className="text-lg font-semibold text-white">
                              {latestHeartbeat.ping}
                              <span className="text-sm text-neutral-400 ml-0.5">
                                ms
                              </span>
                            </p>
                            <p className="text-xs text-neutral-500">Response</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-lg font-semibold text-neutral-600">
                              --
                            </p>
                            <p className="text-xs text-neutral-500">No data</p>
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      <ArrowUpRight className="h-5 w-5 text-neutral-600 group-hover:text-green-400 transition-colors flex-shrink-0" />
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
              Create your first monitor to start tracking uptime and performance
              of your services.
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
  );
}
