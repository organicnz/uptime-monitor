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
import { LiveMonitorsList } from "@/components/live-monitors";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  TrendingUp,
  Zap,
  Clock,
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

  const latestByMonitor = new Map<string, Heartbeat>();
  recentHeartbeats.forEach((hb) => {
    if (!latestByMonitor.has(hb.monitor_id)) {
      latestByMonitor.set(hb.monitor_id, hb);
    }
  });

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
      : "100.0";

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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here&apos;s your uptime overview.
          </p>
        </div>
        <Link href="/dashboard/monitors/new">
          <Button className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" />
            Add Monitor
          </Button>
        </Link>
      </div>

      {/* Active Incidents Banner */}
      {activeIncidents.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5 status-glow-down">
          <CardContent className="py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-destructive/20 rounded-xl">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-destructive">
                    {activeIncidents.length} Active Incident
                    {activeIncidents.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">
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
                  className="border-destructive/30 hover:bg-destructive/10"
                >
                  View Details
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard
          label="Total Monitors"
          value={monitors.length}
          icon={Activity}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <StatsCard
          label="Operational"
          value={upMonitors}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          valueColor="text-emerald-500"
          glow
        />
        <StatsCard
          label="Down"
          value={downMonitors}
          icon={XCircle}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
          valueColor={downMonitors > 0 ? "text-red-500" : undefined}
        />
        <StatsCard
          label="Uptime (24h)"
          value={`${uptimePercentage}%`}
          icon={TrendingUp}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          valueColor="text-emerald-500"
        />
        <StatsCard
          label="Avg Response"
          value={avgResponseTime}
          suffix="ms"
          icon={Zap}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
        />
      </div>

      {/* Monitors Grid */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">Your Monitors</h2>
          <Link
            href="/dashboard/monitors"
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            View all →
          </Link>
        </div>

        {monitors.length > 0 ? (
          <LiveMonitorsList monitors={monitors} />
        ) : (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-primary/10 rounded-2xl mb-4">
                <Activity className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No monitors yet</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Create your first monitor to start tracking uptime and
                performance.
              </p>
              <Link href="/dashboard/monitors/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Monitor
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activity */}
      {recentHeartbeats.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Latest health checks across all monitors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentHeartbeats.slice(0, 8).map((hb) => {
                const monitor = monitors.find((m) => m.id === hb.monitor_id);
                if (!monitor) return null;

                const isUp = hb.status === 1;
                const isDown = hb.status === 0;

                return (
                  <div
                    key={hb.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isUp
                            ? "bg-emerald-500/20"
                            : isDown
                              ? "bg-red-500/20"
                              : "bg-muted"
                        }`}
                      >
                        {isUp ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : isDown ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{monitor.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(hb.time), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    {hb.ping && (
                      <span className="text-sm font-medium text-emerald-500">
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

function StatsCard({
  label,
  value,
  suffix,
  icon: Icon,
  iconColor,
  iconBg,
  valueColor,
  glow,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
  glow?: boolean;
}) {
  return (
    <Card className={`glass-card ${glow ? "status-glow-up" : ""}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold ${valueColor || ""}`}>
              {value}
              {suffix && (
                <span className="text-lg text-muted-foreground ml-0.5">
                  {suffix}
                </span>
              )}
            </p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
