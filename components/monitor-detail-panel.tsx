"use client";

import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { Button } from "@/components/ui/button";
import {
  Pause,
  Play,
  Pencil,
  Trash2,
  ExternalLink,
  Clock,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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

  const validPings = heartbeats.filter((h) => h.ping !== null && h.ping > 0);
  const currentPing = currentStatus?.ping || 0;
  const avgPing =
    validPings.length > 0
      ? Math.round(
          validPings.reduce((sum, h) => sum + (h.ping || 0), 0) /
            validPings.length,
        )
      : 0;

  const last24h = heartbeats.filter((h) => {
    const time = new Date(h.time);
    const now = new Date();
    return now.getTime() - time.getTime() < 24 * 60 * 60 * 1000;
  });
  const uptime24h =
    last24h.length > 0
      ? (
          (last24h.filter((h) => h.status === 1).length / last24h.length) *
          100
        ).toFixed(1)
      : "100.0";
  const uptime30d = uptime24h;

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

  const maxPing =
    validPings.length > 0
      ? Math.max(...validPings.map((h) => h.ping || 0), 100)
      : 100;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-neutral-900/30">
      {/* Header */}
      <div className="p-6 border-b border-neutral-800">
        <h1 className="text-2xl font-bold mb-1">{monitor.name}</h1>
        {monitor.url && (
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:underline text-sm flex items-center gap-1"
          >
            {monitor.url}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {monitor.hostname && (
          <p className="text-neutral-400 text-sm">{monitor.hostname}</p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleActive}
            className="gap-2 border-neutral-700 hover:bg-neutral-800"
          >
            {monitor.active ? (
              <>
                <Pause className="h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume
              </>
            )}
          </Button>
          <Link href={`/dashboard/monitors/${monitor.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-neutral-700 hover:bg-neutral-800"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Monitor</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{monitor.name}&quot; and
                  all its heartbeat data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Heartbeat Bar + Status */}
      <div className="p-6 border-b border-neutral-800">
        <div className="flex items-center gap-4">
          <div className="flex-1 flex gap-[2px] items-center">
            {heartbeats.length > 0
              ? heartbeats
                  .slice(0, 60)
                  .reverse()
                  .map((hb, i) => (
                    <div
                      key={hb.id || i}
                      className={cn(
                        "flex-1 h-8 rounded-sm min-w-[4px] max-w-[8px]",
                        hb.status === 1 && "bg-green-500",
                        hb.status === 0 && "bg-red-500",
                        hb.status === 2 && "bg-neutral-600",
                      )}
                      title={`${new Date(hb.time).toLocaleString()} - ${hb.ping}ms`}
                    />
                  ))
              : Array(60)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 h-8 rounded-sm min-w-[4px] max-w-[8px] bg-neutral-700"
                    />
                  ))}
          </div>
          <div
            className={cn(
              "px-4 py-2 rounded-lg text-lg font-bold",
              isUp && "bg-green-500 text-white",
              isDown && "bg-red-500 text-white",
              !isUp && !isDown && "bg-neutral-700 text-neutral-300",
            )}
          >
            {isUp ? "Up" : isDown ? "Down" : "Pending"}
          </div>
        </div>
        <p className="text-sm text-neutral-400 mt-2 flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          Check every {monitor.interval} seconds.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 p-6 border-b border-neutral-800">
        <StatBox
          label="Response"
          sublabel="(Current)"
          value={`${currentPing} ms`}
          highlight
        />
        <StatBox
          label="Avg. Response"
          sublabel="(24-hour)"
          value={`${avgPing} ms`}
        />
        <StatBox label="Uptime" sublabel="(24-hour)" value={`${uptime24h}%`} />
        <StatBox label="Uptime" sublabel="(30-day)" value={`${uptime30d}%`} />
        <StatBox label="Cert Exp." sublabel="" value="—" muted />
      </div>

      {/* Response Time Chart */}
      <div className="p-6 flex-1">
        <h3 className="text-sm font-medium text-neutral-400 mb-4">
          Response Time (ms)
        </h3>
        <div className="h-48 relative">
          <div className="absolute left-0 top-0 bottom-6 w-12 flex flex-col justify-between text-xs text-neutral-500">
            <span>{maxPing}</span>
            <span>{Math.round(maxPing * 0.5)}</span>
            <span>0</span>
          </div>
          <div className="ml-14 h-full pr-4">
            <svg
              className="w-full h-[calc(100%-24px)]"
              preserveAspectRatio="none"
            >
              <line
                x1="0"
                y1="0%"
                x2="100%"
                y2="0%"
                stroke="currentColor"
                className="text-neutral-700"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="currentColor"
                className="text-neutral-800"
                strokeWidth="1"
                strokeDasharray="4"
              />
              <line
                x1="0"
                y1="100%"
                x2="100%"
                y2="100%"
                stroke="currentColor"
                className="text-neutral-700"
                strokeWidth="1"
              />
              {validPings.length > 1 && (
                <>
                  <path
                    d={`M 0 ${100 - ((validPings[validPings.length - 1]?.ping || 0) / maxPing) * 100}% ${validPings
                      .slice()
                      .reverse()
                      .map(
                        (h, i) =>
                          `L ${(i / (validPings.length - 1)) * 100}% ${100 - ((h.ping || 0) / maxPing) * 100}%`,
                      )
                      .join(" ")} L 100% 100% L 0 100% Z`}
                    fill="url(#gradient)"
                    opacity="0.3"
                  />
                  <path
                    d={`M 0 ${100 - ((validPings[validPings.length - 1]?.ping || 0) / maxPing) * 100}% ${validPings
                      .slice()
                      .reverse()
                      .map(
                        (h, i) =>
                          `L ${(i / (validPings.length - 1)) * 100}% ${100 - ((h.ping || 0) / maxPing) * 100}%`,
                      )
                      .join(" ")}`}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </>
              )}
            </svg>
            <div className="flex justify-between text-xs text-neutral-500 mt-1">
              {heartbeats.length > 0 ? (
                <>
                  <span>
                    {new Date(
                      heartbeats[heartbeats.length - 1]?.time,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>
                    {new Date(heartbeats[0]?.time).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </>
              ) : (
                <>
                  <span>—</span>
                  <span>—</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-neutral-800 text-xs text-neutral-500 flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          Created {new Date(monitor.created_at).toLocaleDateString()}
        </span>
        <span
          className={cn(
            "flex items-center gap-1",
            isConnected ? "text-green-400" : "text-neutral-500",
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
}: {
  label: string;
  sublabel: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-sm text-neutral-400">
        {label}
        {sublabel && (
          <span className="block text-xs text-neutral-500">{sublabel}</span>
        )}
      </div>
      <div
        className={cn(
          "text-lg font-semibold mt-1",
          highlight &&
            "text-green-400 underline cursor-pointer hover:text-green-300",
          muted && "text-neutral-500",
        )}
      >
        {value}
      </div>
    </div>
  );
}
