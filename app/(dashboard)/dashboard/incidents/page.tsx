import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Plus, CheckCircle2, Search, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { IncidentStatusBadge } from "@/components/incident-status-badge";
import { IncidentQuickActions } from "@/components/incident-quick-actions";

type Incident = {
  id: string;
  monitor_id: string;
  title: string;
  content: string | null;
  status: number;
  started_at: string;
  resolved_at: string | null;
  created_at: string;
  monitors: { name: string; type: string } | null;
};

export default async function IncidentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch incidents with monitor info
  const { data: incidentsData } = await supabase
    .from("incidents")
    .select(
      `
      *,
      monitors:monitor_id (name, type, user_id)
    `,
    )
    .order("started_at", { ascending: false });

  // Filter to only user's incidents
  const incidents = ((incidentsData || []) as Incident[]).filter(
    (inc) =>
      (inc.monitors as unknown as { user_id: string })?.user_id === user.id,
  );

  const openIncidents = incidents.filter((i) => i.status === 0);
  const investigatingIncidents = incidents.filter((i) => i.status === 2);
  const resolvedIncidents = incidents.filter((i) => i.status === 1);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Incidents</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage service incidents
            </p>
          </div>
          <Link href="/dashboard/incidents/new">
            <Button className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Report Incident
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{openIncidents.length}</p>
                  <p className="text-xs text-muted-foreground">Open</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Search className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {investigatingIncidents.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Investigating</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {resolvedIncidents.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Incidents */}
        {(openIncidents.length > 0 || investigatingIncidents.length > 0) && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Active Incidents
            </h2>
            {[...openIncidents, ...investigatingIncidents].map((incident) => (
              <Card
                key={incident.id}
                className={cn(
                  "glass-card transition-shadow hover:shadow-md",
                  incident.status === 0 && "border-red-500/30",
                  incident.status === 2 && "border-amber-500/30",
                )}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">
                          {incident.title}
                        </h3>
                        <IncidentStatusBadge status={incident.status} />
                      </div>
                      {incident.content && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {incident.content}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          Started{" "}
                          {formatDistanceToNow(new Date(incident.started_at), {
                            addSuffix: true,
                          })}
                        </span>
                        {incident.monitors && (
                          <span className="px-2 py-0.5 rounded-md bg-muted text-xs">
                            {incident.monitors.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <IncidentQuickActions incident={incident} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Resolved Incidents */}
        {resolvedIncidents.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Recently Resolved
            </h2>
            {resolvedIncidents.slice(0, 10).map((incident) => (
              <Card key={incident.id} className="glass-card">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium">{incident.title}</h3>
                        <IncidentStatusBadge status={incident.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <span>
                          Resolved{" "}
                          {formatDistanceToNow(
                            new Date(
                              incident.resolved_at || incident.started_at,
                            ),
                            { addSuffix: true },
                          )}
                        </span>
                        {incident.monitors && (
                          <span className="px-2 py-0.5 rounded-md bg-muted text-xs">
                            {incident.monitors.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link href={`/dashboard/incidents/${incident.id}/edit`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {incidents.length === 0 && (
          <Card className="glass-card border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-emerald-500/10 rounded-2xl mb-4">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                No incidents recorded
              </h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Incidents are automatically created when monitors go down. You
                can also manually report incidents.
              </p>
              <Link href="/dashboard/incidents/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Report an Incident
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
