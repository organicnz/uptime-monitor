import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Globe,
  Server,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GPUStatusBackground } from "@/components/gpu-status-background-client";
import { createPublicClient } from "@/lib/supabase/public";
import { Monitor, StatusPage } from "@/types/application";

/**
 * The public page's data, cached for thirty seconds.
 *
 * The page is public, it changes when a monitor's status does, and the
 * CDN is already told to hold it for thirty seconds — so the origin
 * should not be asking the database on every request either.
 *
 * The read goes through the anon client, which reads no cookies, so the
 * page has no user-specific part: the same rendering serves everybody,
 * and that is what makes it cacheable at all. The function is what
 * carries the cache, because the framework cannot cache the request
 * underneath it — a PostgREST call is a POST, and the framework only
 * caches GETs.
 *
 * A slug that does not exist is not an error here. `notFound()` throws,
 * and a thrown error is not something to keep in a cache: the page
 * decides what a missing slug means, once the data is in hand.
 */
async function readStatusPage(slug: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 120 });

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("get_public_status_page", {
    p_slug: slug,
  });

  if (error) return { rows: [], failed: true };
  return { rows: data ?? [], failed: false };
}

/**
 * The slug is in the URL, so the page's content resolves per request.
 *
 * A route with a dynamic segment cannot prerender its content without
 * knowing the segment, and the segment is the slug. What *can* be
 * prerendered is the shell around it, and what *can* be cached is the
 * data, and the data is cached above: the origin spends its time
 * rendering a page, not waiting for the database.
 *
 * The CDN holds the rendered page for thirty seconds on top of that, so
 * the origin sees this route once per window, not once per reader.
 */
export const instant = false;

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
  const { rows: pageRows, failed } = await readStatusPage(slug);

  if (failed || pageRows.length === 0) {
    notFound();
  }

  const firstRow = pageRows[0];
  const typedStatusPage = firstRow as unknown as StatusPage;
  type PublicMonitor = Pick<Monitor, "id" | "name" | "type">;
  const publicRows = pageRows.filter(
    (row) => row.monitor_id && row.monitor_name,
  );
  const monitors: PublicMonitor[] = publicRows.map((row) => ({
    id: row.monitor_id!,
    name: row.monitor_name!,
    type: row.monitor_type as Monitor["type"],
  }));

  if (monitors.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-neutral-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{typedStatusPage.title}</h1>
          <p className="text-neutral-500">No monitors configured.</p>
        </div>
      </div>
    );
  }

  const monitorStatus = new Map<string, number>();
  const monitorLatency = new Map<string, number | null>();
  for (const row of publicRows) {
    if (row.monitor_id) {
      monitorStatus.set(row.monitor_id, row.status);
      monitorLatency.set(row.monitor_id, row.ping);
    }
  }

  // Calculate Overall System Status
  const allUp = Array.from(monitorStatus.values()).every((s) => s === 1);
  const anyDown = Array.from(monitorStatus.values()).some((s) => s === 0);
  // A degraded monitor is answering, just slowly. Treating it as a failure
  // here would announce an outage for a latency regression, which is exactly
  // what lib/analytics.ts counts DEGRADED as success to avoid.
  const anyDegraded = Array.from(monitorStatus.values()).some((s) => s === 4);
  const systemStatus = anyDown
    ? "Systems Down"
    : anyDegraded
      ? "Degraded Performance"
      : allUp
        ? "All Systems Operational"
        : "Partial Outage"; // Simplified logic

  const systemHealth = anyDown ? "down" : allUp ? "up" : "degraded";

  return (
    <div className="relative min-h-screen bg-slate-50 font-sans text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <GPUStatusBackground status={systemHealth} />
      <div className="relative mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {typedStatusPage.title}
            </h1>
            {typedStatusPage.description && (
              <p className="mt-2 text-neutral-500">
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
          className={`mb-8 flex items-center gap-4 rounded-lg p-6 text-white shadow-sm ${
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
                : anyDegraded
                  ? "Some services are responding slower than usual."
                  : "All services are running smoothly."}
            </p>
          </div>
        </div>

        {/* Monitors List */}
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="border-b border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
            <h3 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
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
              const isDegraded = status === 4;

              return (
                <div
                  key={monitor.id}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`rounded-lg p-2 ${
                        isUp
                          ? "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                          : isDown
                            ? "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                            : isDegraded
                              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                              : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                      }`}
                    >
                      {isUp ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : isDown ? (
                        <XCircle className="h-5 w-5" />
                      ) : isDegraded ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Clock className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-lg font-medium">{monitor.name}</h4>
                      <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Icon className="h-3 w-3" />
                          <span className="text-xs uppercase">
                            {monitor.type}
                          </span>
                        </span>
                        {ping && (
                          <span className="font-mono text-xs">{ping}ms</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${
                        isUp
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : isDown
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : isDegraded
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {isUp
                        ? "Operational"
                        : isDown
                          ? "Outage"
                          : isDegraded
                            ? "Degraded"
                            : "Unknown"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 text-center text-sm text-neutral-400">
          Powered by{" "}
          <Link
            href="/"
            className="underline decoration-neutral-700 hover:text-neutral-200"
          >
            Uptime Monitor
          </Link>
        </div>
      </div>
    </div>
  );
}
