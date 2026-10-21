import { format, isFuture, isPast } from "date-fns";
import { AlertTriangle, Calendar, Clock, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type Maintenance = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  strategy: string | null;
  cron: string | null;
  created_at: string;
};

type MaintenanceMonitor = {
  monitor_id: string;
  monitors: { name: string } | null;
};

export default async function MaintenancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: maintenanceData } = await supabase
    .from("maintenance")
    .select("*")
    .eq("user_id", user.id)
    .order("start_date", { ascending: false });

  const maintenance = (maintenanceData || []) as Maintenance[];

  // Get monitor assignments for each maintenance window
  const maintenanceWithMonitors = await Promise.all(
    maintenance.map(async (m) => {
      const { data: monitorsData } = await supabase
        .from("maintenance_monitors")
        .select("monitor_id, monitors:monitor_id(name)")
        .eq("maintenance_id", m.id);

      const monitors = (monitorsData || []) as MaintenanceMonitor[];
      return {
        ...m,
        monitorNames: monitors
          .map((mm) => mm.monitors?.name)
          .filter(Boolean) as string[],
      };
    }),
  );

  const getMaintenanceStatus = (m: Maintenance) => {
    const now = new Date();
    const start = new Date(m.start_date);
    const end = new Date(m.end_date);

    if (!m.active)
      return {
        label: "Disabled",
        color: "text-muted-foreground",
        bg: "bg-muted",
      };
    if (now >= start && now <= end)
      return {
        label: "In Progress",
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      };
    if (isFuture(start))
      return {
        label: "Scheduled",
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      };
    if (isPast(end))
      return {
        label: "Completed",
        color: "text-emerald-500",
        bg: "bg-emerald-500/10",
      };
    return { label: "Unknown", color: "text-muted-foreground", bg: "bg-muted" };
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="gradient-text text-3xl font-bold">
              Maintenance Windows
            </h1>
            <p className="mt-1 text-muted-foreground">
              Schedule maintenance periods to pause monitoring
            </p>
          </div>
          <Link href="/dashboard/maintenance/new">
            <Button className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Schedule Maintenance
            </Button>
          </Link>
        </div>

        {/* Info Card */}
        <Card className="glass-card border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
              How Maintenance Windows Work
            </CardTitle>
            <CardDescription>
              During a maintenance window, monitors will show a
              &quot;Maintenance&quot; status instead of triggering down alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              • Monitors assigned to a maintenance window will pause alerting
              during the scheduled period
            </p>
            <p>
              • Heartbeats will still be recorded with a &quot;Maintenance&quot;
              status (code 3)
            </p>
            <p>
              • Once the maintenance window ends, normal monitoring resumes
              automatically
            </p>
          </CardContent>
        </Card>

        {/* Maintenance List */}
        {maintenanceWithMonitors.length > 0 ? (
          <div className="space-y-4">
            {maintenanceWithMonitors.map((m) => {
              const status = getMaintenanceStatus(m);
              return (
                <Card
                  key={m.id}
                  className="glass-card transition-shadow hover:shadow-md"
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="flex items-start gap-4">
                        <div className={`rounded-xl p-3 ${status.bg}`}>
                          <Wrench className={`h-6 w-6 ${status.color}`} />
                        </div>
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="text-lg font-semibold">{m.title}</h3>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </div>
                          {m.description && (
                            <p className="mb-2 text-sm text-muted-foreground">
                              {m.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(m.start_date), "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4" />
                              {format(new Date(m.start_date), "HH:mm")} -{" "}
                              {format(new Date(m.end_date), "HH:mm")}
                            </span>
                          </div>
                          {m.monitorNames.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {m.monitorNames.slice(0, 5).map((name) => (
                                <span
                                  key={name}
                                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                >
                                  {name}
                                </span>
                              ))}
                              {m.monitorNames.length > 5 && (
                                <span className="text-xs text-muted-foreground">
                                  +{m.monitorNames.length - 5} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/maintenance/${m.id}/edit`}>
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="glass-card border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 rounded-2xl bg-primary/10 p-4">
                <Wrench className="h-12 w-12 text-primary" />
              </div>
              <h3 className="mb-2 text-xl font-semibold">
                No maintenance windows
              </h3>
              <p className="mb-6 max-w-md text-center text-muted-foreground">
                Schedule maintenance windows to temporarily pause monitoring
                during planned downtime.
              </p>
              <Link href="/dashboard/maintenance/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Schedule Your First Maintenance
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
