"use client";

import {
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { ResponseChart } from "@/components/ui/response-chart";
import { StatBox } from "@/components/ui/stat-box";
import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { duplicateMonitor } from "@/lib/actions/monitors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
  const [isDuplicating, startDuplicateTransition] = useTransition();
  const { heartbeats, currentStatus, isConnected } = useRealtimeMonitor(
    monitor.id,
  );
  const router = useRouter();
  const supabase = createClient();

  const isUp = currentStatus?.status === "up";
  const isDown = currentStatus?.status === "down";
  const isPaused = !monitor.active;
  const isDegraded = currentStatus?.status === "degraded";
  const isMaintenance = currentStatus?.status === "maintenance";

  // Anchor the 24h stats window to the latest heartbeat instead of the wall
  // clock. This keeps server and client renders identical (no hydration
  // mismatch) without any client-only state.
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

    const anchor =
      heartbeats.length > 0 ? new Date(heartbeats[0].time).getTime() : null;
    const last24h =
      anchor === null
        ? heartbeats
        : heartbeats.filter(
            (h) => anchor - new Date(h.time).getTime() < 24 * 60 * 60 * 1000,
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
  }, [heartbeats, currentStatus]);

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

  const handleDuplicate = () => {
    startDuplicateTransition(async () => {
      const result = await duplicateMonitor(monitor.id);
      if (result.success) {
        toast.success(`Created "${result.name}"`, {
          description:
            "The duplicate is paused. Review settings before activating.",
          action: {
            label: "View",
            onClick: () => router.push(`/dashboard/monitors/${result.id}`),
          },
        });
        router.refresh();
      } else {
        toast.error("Failed to duplicate", {
          description: result.error,
        });
      }
    });
  };

  const handleDelete = async () => {
    await supabase.from("monitors").delete().eq("id", monitor.id);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-neutral-950/30">
      {/* Header */}
      <div className="border-b border-white/5 bg-neutral-900/40 p-4 backdrop-blur-sm sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold sm:text-2xl">
              {monitor.name}
            </h1>
            {monitor.url && (
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs break-all text-green-400 hover:text-green-300 sm:text-sm"
              >
                <span className="truncate">{monitor.url}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            )}
            {monitor.hostname && !monitor.url && (
              <p className="mt-1 truncate text-xs text-neutral-400 sm:text-sm">
                {monitor.hostname}
              </p>
            )}
          </div>

          {/* Paused Badge */}
          {isPaused && (
            <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-400 sm:px-3 sm:text-sm">
              Paused
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="gap-1.5 border-neutral-700 hover:bg-neutral-800"
          >
            {isDuplicating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Duplicate
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
            <AlertDialogContent className="border-neutral-800 bg-neutral-900">
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
      <div className="border-b border-white/5 bg-neutral-900/20 p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Heartbeat visualization */}
          <div className="flex flex-1 items-center gap-[2px] overflow-hidden sm:gap-[3px]">
            {heartbeats.length > 0
              ? heartbeats
                  .slice(0, 50)
                  .reverse()
                  .map((hb, i) => (
                    <div
                      key={hb.id || i}
                      className={cn(
                        "h-7 max-w-[8px] min-w-[3px] flex-1 cursor-pointer rounded-[2px] transition-colors sm:h-9 sm:max-w-[10px] sm:min-w-[4px] sm:rounded-[3px]",
                        hb.status === 1 && "bg-green-500 hover:bg-green-400",
                        hb.status === 0 && "bg-red-500 hover:bg-red-400",
                        hb.status === 2 &&
                          "bg-neutral-600 hover:bg-neutral-500",
                        hb.status === 3 && "bg-sky-500 hover:bg-sky-400",
                        hb.status === 4 && "bg-amber-500 hover:bg-amber-400",
                      )}
                      title={`${new Date(hb.time).toLocaleString()}\n${hb.ping ? `${hb.ping}ms` : "N/A"}`}
                    />
                  ))
              : Array(50)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="h-7 max-w-[8px] min-w-[3px] flex-1 rounded-[2px] bg-neutral-700 sm:h-9 sm:max-w-[10px] sm:min-w-[4px] sm:rounded-[3px]"
                    />
                  ))}
          </div>

          {/* Status Badge */}
          <div
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-sm font-bold sm:px-5 sm:py-2.5 sm:text-lg",
              isPaused && "bg-amber-500 text-white",
              !isPaused && isUp && "bg-green-500 text-white",
              !isPaused && isDown && "bg-red-500 text-white",
              !isPaused &&
                !isUp &&
                !isDown &&
                !isDegraded &&
                !isMaintenance &&
                "bg-neutral-700 text-neutral-300",
              !isPaused && isDegraded && "bg-amber-500 text-black",
              !isPaused && isMaintenance && "bg-sky-500 text-white",
            )}
          >
            {isPaused
              ? "Paused"
              : isUp
                ? "Up"
                : isDown
                  ? "Down"
                  : isDegraded
                    ? "Degraded"
                    : isMaintenance
                      ? "Maintenance"
                      : "Pending"}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-neutral-500 sm:mt-3 sm:text-sm">
          <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          Check every {monitor.interval} seconds.
        </p>
      </div>

      {/* Stats Grid - responsive */}
      <div className="grid grid-cols-2 border-b border-white/5 bg-neutral-900/30 backdrop-blur-sm sm:grid-cols-3 md:grid-cols-5">
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
      <div className="px-4 py-3 sm:px-6">
        <h3 className="mb-1 text-xs font-medium text-neutral-400">
          Response Time (ms)
        </h3>
        <ResponseChart heartbeats={stats.validPings} maxPing={stats.maxPing} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/5 bg-neutral-900/30 px-6 py-3 text-xs text-neutral-500 backdrop-blur-sm">
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
              isConnected ? "animate-pulse bg-green-500" : "bg-neutral-600",
            )}
          />
          {isConnected ? "Live" : "Connecting..."}
        </span>
      </div>
    </div>
  );
}

/* StatBox and ResponseChart are now imported from components/ui/ */
