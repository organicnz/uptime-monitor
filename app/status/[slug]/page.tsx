import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  Globe,
  Server,
  Zap,
  Shield,
} from "lucide-react";

import { Monitor, StatusPage, Heartbeat } from "@/types/application";

// Reusing types from dashboard
const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  https: Shield,
  tcp: Server,
  ping: Zap,
  keyword: Globe,
  dns: Server,
  docker: Server,
};

export default async function PublicStatusPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Fetch Status Page
  const { data: statusPage, error } = await supabase
    .from("status_pages")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !statusPage) {
    notFound();
  }

  const typedStatusPage = statusPage as unknown as StatusPage;

  // 2. Fetch Monitors for this page
  // join status_page_monitors -> monitors
  const { data: pageMonitors } = await supabase
    .from("status_page_monitors")
    .select("monitor_id, display_order, monitors(*)")
    .eq("status_page_id", typedStatusPage.id)
    .order("display_order");

  // Cast the joined data
  type PageMonitorJoin = {
    monitor_id: string;
    display_order: number;
    monitors: Monitor;
  };
  const monitors: Monitor[] =
    pageMonitors?.map((pm: PageMonitorJoin) => pm.monitors as Monitor) || [];
  const monitorIds: string[] = monitors.map((m) => m.id);

  if (monitorIds.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{typedStatusPage.title}</h1>
          <p className="text-neutral-500">No monitors configured.</p>
        </div>
      </div>
    );
  }

  // 3. Fetch Latest Heartbeats
  // We want the LATEST check for each monitor to determine current status
  // Ideally we use a distinct on or just group in application
  // For simplicity, let's fetch recent checks and filter
  const { data: checks } = await supabase
    .from("heartbeats")
    .select("*")
    .in("monitor_id", monitorIds)
    .order("time", { ascending: false })
    .limit(monitors.length * 5); // Fetch enough to cover all

  // Map monitor -> latest status
  const monitorStatus = new Map<string, number>();
  const monitorLatency = new Map<string, number | null>();

  monitors.forEach((m) => {
    const typedChecks = (checks || []) as Heartbeat[];
    const latest = typedChecks.find((c: Heartbeat) => c.monitor_id === m.id);
    if (latest) {
      monitorStatus.set(m.id, latest.status);
      monitorLatency.set(m.id, latest.ping);
    } else {
      monitorStatus.set(m.id, 2); // Pending
    }
  });

  // Calculate Overall System Status
  const allUp = Array.from(monitorStatus.values()).every((s) => s === 1);
  const anyDown = Array.from(monitorStatus.values()).some((s) => s === 0);
  const systemStatus = anyDown
    ? "Systems Down"
    : allUp
      ? "All Systems Operational"
      : "Partial Outage"; // Simplified logic

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {typedStatusPage.title}
            </h1>
            {typedStatusPage.description && (
              <p className="text-neutral-500 mt-2">
                {typedStatusPage.description}
              </p>
            )}
          </div>
          {typedStatusPage.custom_domain && (
            <a
              href={`https://${typedStatusPage.custom_domain}`}
              className="text-sm text-blue-500 hover:underline"
            >
              {typedStatusPage.custom_domain}
            </a>
          )}
        </div>

        {/* System Status Banner */}
        <div
          className={`rounded-lg p-6 mb-8 text-white flex items-center gap-4 shadow-sm ${
            anyDown ? "bg-red-500" : allUp ? "bg-green-500" : "bg-yellow-500"
          }`}
        >
          {anyDown ? (
            <XCircle className="h-8 w-8" />
          ) : allUp ? (
            <CheckCircle2 className="h-8 w-8" />
          ) : (
            <AlertTriangle className="h-8 w-8" />
          )}
          <div>
            <h2 className="text-2xl font-bold">{systemStatus}</h2>
            <p className="opacity-90">
              {anyDown
                ? "Some services are currently experiencing issues."
                : "All services are running smoothly."}
            </p>
          </div>
        </div>

        {/* Monitors List */}
        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50">
            <h3 className="font-semibold text-neutral-500 uppercase text-xs tracking-wider">
              Service Status
            </h3>
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {monitors.map((monitor) => {
              const status = monitorStatus.get(monitor.id);
              const ping = monitorLatency.get(monitor.id);
              const Icon = typeIcons[monitor.type] || Activity;

              const isUp = status === 1;
              const isDown = status === 0;

              return (
                <div
                  key={monitor.id}
                  className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        isUp
                          ? "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                          : isDown
                            ? "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                      }`}
                    >
                      {isUp ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isDown ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-lg">{monitor.name}</h4>
                      <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Icon className="h-3 w-3" />
                          <span className="uppercase text-xs">
                            {monitor.type}
                          </span>
                        </span>
                        {ping && (
                          <span className="text-xs font-mono">{ping}ms</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                        isUp
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : isDown
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {isUp ? "Operational" : isDown ? "Outage" : "Unknown"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-neutral-400">
          Powered by{" "}
          <a
            href="#"
            className="underline decoration-neutral-700 hover:text-neutral-200"
          >
            Uptime Monitor
          </a>
        </div>
      </div>
    </div>
  );
}
