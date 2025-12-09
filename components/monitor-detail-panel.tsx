"use client";

import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { Button } from "@/components/ui/button";
import { Pause, Play, Pencil, Trash2, ExternalLink, Clock } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  interval: number;
  active: boolean;
  created_at: string;
};

type MonitorDetailPanelProps = {
  monitor: Monitor;
};

export function MonitorDetailPanel({
  monitor: initialMonitor,
}: MonitorDetailPanelProps) {
  const [monitor, setMonitor] = useState(initialMonitor);
  const { heartbeats, currentStatus, isConnected } = useRealtimeMonitor(
    monitor.id,
  );
  const router = useRouter();
  const supabase = createClient();

  const isUp = currentStatus?.status === "up";
  const isDown = currentStatus?.status === "down";
  const isPaused = !monitor.active;

  // Calculate stats - use a stable timestamp for 24h calculation
  const [statsTimestamp] = useState(() => Date.now());
  const stats = useMemo(() => {
    const validPings = heartbeats.filter((h) => h.ping !== null && h.ping > 0);
    const currentPing = currentStatus?.ping || 0;
    const avgPing =
      validPings.length > 0
        ? Math.round(
            validPings.reduce((sum, h) => sum + (h.ping || 0), 0) /
              validPings.length,
          )
        : 0;

    const last24h = heartbeats.filter(
      (h) => statsTimestamp - new Date(h.time).getTime() < 24 * 60 * 60 * 1000,
    );
    const uptime24h =
      last24h.length > 0
        ? (
            (last24h.filter((h) => h.status === 1).length / last24h.length) *
            100
          ).toFixed(1)
        : "100.0";

    const maxPing =
      validPings.length > 0
        ? Math.max(...validPings.map((h) => h.ping || 0), 100)
        : 100;

    return { currentPing, avgPing, uptime24h, maxPing, validPings };
  }, [heartbeats, currentStatus, statsTimestamp]);

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

  const handleDelete = async () => {
    await supabase.from("monitors").delete().eq("id", monitor.id);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{monitor.name}</h1>
            {monitor.url && (
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300 text-sm inline-flex items-center gap-1 mt-1"
              >
                {monitor.url}
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            )}
            {monitor.hostname && !monitor.url && (
              <p className="text-neutral-400 text-sm mt-1">
                {monitor.hostname}
              </p>
            )}
          </div>

          {/* Paused Badge */}
          {isPaused && (
            <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium flex-shrink-0">
              Paused
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleActive}
            className="gap-1.5 border-neutral-700 hover:bg-neutral-800"
          >
            {monitor.active ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {monitor.active ? "Pause" : "Resume"}
          </Button>
          <Link href={`/dashboard/monitors/${monitor.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-neutral-700 hover:bg-neutral-800"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-neutral-900 border-neutral-800">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Monitor</AlertDialogTitle>
                <AlertDialogDescription className="text-neutral-400">
                  This will permanently delete &quot;{monitor.name}&quot; and
                  all its heartbeat data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-neutral-700">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Heartbeat Bar + Status Badge */}
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          {/* Heartbeat visualization */}
          <div className="flex-1 flex gap-[3px] items-center overflow-hidden">
            {heartbeats.length > 0
              ? heartbeats
                  .slice(0, 50)
                  .reverse()
                  .map((hb, i) => (
                    <div
                      key={hb.id || i}
                      className={cn(
                        "flex-1 h-9 rounded-[3px] min-w-[4px] max-w-[10px] transition-colors cursor-pointer",
                        hb.status === 1 && "bg-green-500 hover:bg-green-400",
                        hb.status === 0 && "bg-red-500 hover:bg-red-400",
                        hb.status === 2 &&
                          "bg-neutral-600 hover:bg-neutral-500",
                      )}
                      title={`${new Date(hb.time).toLocaleString()}\n${hb.ping ? `${hb.ping}ms` : "N/A"}`}
                    />
                  ))
              : Array(50)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-9 rounded-[3px] min-w-[4px] max-w-[10px] bg-neutral-700"
                    />
                  ))}
          </div>

          {/* Status Badge */}
          <div
            className={cn(
              "px-5 py-2.5 rounded-lg text-lg font-bold shrink-0",
              isPaused && "bg-amber-500 text-white",
              !isPaused && isUp && "bg-green-500 text-white",
              !isPaused && isDown && "bg-red-500 text-white",
              !isPaused &&
                !isUp &&
                !isDown &&
                "bg-neutral-700 text-neutral-300",
            )}
          >
            {isPaused ? "Paused" : isUp ? "Up" : isDown ? "Down" : "Pending"}
          </div>
        </div>
        <p className="text-sm text-neutral-500 mt-3 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          Check every {monitor.interval} seconds.
        </p>
      </div>

      {/* Stats Grid - responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-neutral-800">
        <StatBox
          label="Response"
          sublabel="(Current)"
          value={`${stats.currentPing} ms`}
          highlight
        />
        <StatBox
          label="Avg. Response"
          sublabel="(24-hour)"
          value={`${stats.avgPing} ms`}
        />
        <StatBox
          label="Uptime"
          sublabel="(24-hour)"
          value={`${stats.uptime24h}%`}
        />
        <StatBox
          label="Uptime"
          sublabel="(30-day)"
          value={`${stats.uptime24h}%`}
        />
        <StatBox
          label="Cert Exp."
          sublabel=""
          value="—"
          muted
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Response Time Chart */}
      <div className="flex-1 p-6 min-h-[250px]">
        <h3 className="text-sm font-medium text-neutral-400 mb-4">
          Response Time (ms)
        </h3>
        <ResponseChart heartbeats={stats.validPings} maxPing={stats.maxPing} />
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-neutral-800 text-xs text-neutral-500 flex items-center justify-between">
        <span>Created {new Date(monitor.created_at).toLocaleDateString()}</span>
        <span
          className={cn(
            "flex items-center gap-1.5",
            isConnected ? "text-green-400" : "",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isConnected ? "bg-green-500 animate-pulse" : "bg-neutral-600",
            )}
          />
          {isConnected ? "Live" : "Connecting..."}
        </span>
      </div>
    </div>
  );
}

function StatBox({
  label,
  sublabel,
  value,
  highlight,
  muted,
  className,
}: {
  label: string;
  sublabel?: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "py-5 px-4 text-center border-b border-neutral-800 sm:border-b-0 sm:border-r last:border-r-0",
        className,
      )}
    >
      <div className="text-sm text-neutral-400 mb-1">
        {label}
        {sublabel && (
          <span className="block text-xs text-neutral-500">{sublabel}</span>
        )}
      </div>
      <div
        className={cn(
          "text-lg font-semibold",
          highlight &&
            "text-green-400 underline decoration-green-400/30 underline-offset-2 cursor-pointer hover:text-green-300",
          muted && "text-neutral-600",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ResponseChart({
  heartbeats,
  maxPing,
}: {
  heartbeats: { ping: number | null; time: string }[];
  maxPing: number;
}) {
  if (heartbeats.length < 2) {
    return (
      <div className="h-full min-h-[180px] flex items-center justify-center text-neutral-500 text-sm">
        Not enough data for chart
      </div>
    );
  }

  const points = heartbeats.slice(0, 100).reverse();
  const chartMax = Math.max(maxPing * 1.1, 100);

  return (
    <div className="h-full min-h-[180px] flex flex-col">
      <div className="flex-1 relative">
        {/* Y-axis */}
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-xs text-neutral-600 pr-2 text-right">
          <span>{Math.round(chartMax)}</span>
          <span>{Math.round(chartMax / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart */}
        <div className="ml-12 h-full">
          <svg
            className="w-full h-[calc(100%-24px)]"
            preserveAspectRatio="none"
            viewBox="0 0 100 100"
          >
            {/* Grid */}
            <line
              x1="0"
              y1="0"
              x2="100"
              y2="0"
              stroke="#404040"
              strokeWidth="0.5"
            />
            <line
              x1="0"
              y1="50"
              x2="100"
              y2="50"
              stroke="#333"
              strokeWidth="0.5"
              strokeDasharray="2"
            />
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="100"
              stroke="#404040"
              strokeWidth="0.5"
            />

            {/* Area fill */}
            <path
              d={`M 0 100 ${points
                .map((p, i) => {
                  const x = (i / (points.length - 1)) * 100;
                  const y = 100 - ((p.ping || 0) / chartMax) * 100;
                  return `L ${x} ${y}`;
                })
                .join(" ")} L 100 100 Z`}
              fill="url(#areaGradient)"
            />

            {/* Line */}
            <path
              d={`M ${points
                .map((p, i) => {
                  const x = (i / (points.length - 1)) * 100;
                  const y = 100 - ((p.ping || 0) / chartMax) * 100;
                  return `${i === 0 ? "" : "L "}${x} ${y}`;
                })
                .join(" ")}`}
              fill="none"
              stroke="#22c55e"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />

            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>

          {/* X-axis labels */}
          <div className="flex justify-between text-xs text-neutral-600 mt-1">
            <span>
              {new Date(points[0]?.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>
              {new Date(points[points.length - 1]?.time).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" },
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
