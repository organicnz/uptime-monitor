import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LiveMonitorsList } from "@/components/live-monitors";
import {
  Activity,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
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

export default async function MonitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const monitors = (monitorsData || []) as Monitor[];

  const monitorIds = monitors.map((m) => m.id);
  const { data: heartbeatsData } = await supabase
    .from("heartbeats")
    .select("*")
    .in("monitor_id", monitorIds)
    .order("time", { ascending: false });

  const heartbeats = (heartbeatsData || []) as Heartbeat[];

  const latestHeartbeats = new Map<string, Heartbeat>();
  heartbeats.forEach((hb) => {
    if (!latestHeartbeats.has(hb.monitor_id)) {
      latestHeartbeats.set(hb.monitor_id, hb);
    }
  });

  const upCount = monitors.filter((m) => {
    const hb = latestHeartbeats.get(m.id);
    return hb && hb.status === 1;
  }).length;
  const downCount = monitors.filter((m) => {
    const hb = latestHeartbeats.get(m.id);
    return hb && hb.status === 0;
  }).length;
  const pendingCount = monitors.length - upCount - downCount;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Monitors</h1>
          <p className="text-muted-foreground mt-1">
            Track uptime and performance of your services
          </p>
        </div>
        <Link href="/dashboard/monitors/new">
          <Button className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" />
            Add Monitor
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Monitors"
          value={monitors.length}
          icon={Activity}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
        />
        <StatsCard
          label="Operational"
          value={upCount}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          valueColor="text-emerald-500"
        />
        <StatsCard
          label="Down"
          value={downCount}
          icon={XCircle}
          iconColor="text-red-500"
          iconBg="bg-red-500/10"
          valueColor={downCount > 0 ? "text-red-500" : undefined}
        />
        <StatsCard
          label="Pending"
          value={pendingCount}
          icon={AlertCircle}
          iconColor="text-muted-foreground"
          iconBg="bg-muted"
        />
      </div>

      {/* Monitors List */}
      {monitors.length > 0 ? (
        <LiveMonitorsList monitors={monitors} />
      ) : (
        <Card className="glass-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-primary/10 rounded-2xl mb-4">
              <Activity className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No monitors yet</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              Create your first monitor to start tracking uptime and performance
              of your services.
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
  );
}

function StatsCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  valueColor,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold ${valueColor || ""}`}>{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
