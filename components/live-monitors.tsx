"use client";

import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  interval: number;
  active: boolean;
};

interface LiveMonitorsListProps {
  monitors: Monitor[];
}

export function LiveMonitorsList({ monitors }: LiveMonitorsListProps) {
  const monitorIds = monitors.map((m) => m.id);
  const { statuses, isConnected, lastUpdate } = useRealtimeMonitors(monitorIds);

  const getStatusDisplay = (monitorId: string) => {
    const status = statuses.get(monitorId);
    if (!status) {
      return {
        status: "pending" as const,
        color: "text-neutral-400",
        bgColor: "bg-neutral-500/20",
        icon: AlertCircle,
        label: "Pending",
        ping: null,
      };
    }

    const configs = {
      up: {
        color: "text-green-400",
        bgColor: "bg-green-500/20",
        icon: CheckCircle2,
        label: "Up",
      },
      down: {
        color: "text-red-400",
        bgColor: "bg-red-500/20",
        icon: XCircle,
        label: "Down",
      },
      pending: {
        color: "text-neutral-400",
        bgColor: "bg-neutral-500/20",
        icon: AlertCircle,
        label: "Pending",
      },
    };

    const config = configs[status.status];
    return {
      ...config,
      status: status.status,
      ping: status.ping,
      lastCheck: status.lastCheck,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-400" />
              <span className="text-green-400">Live updates active</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-neutral-500" />
              <span className="text-neutral-500">Connecting...</span>
            </>
          )}
        </div>
        {lastUpdate && (
          <span className="text-neutral-500 text-xs">
            Last update: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {monitors.map((monitor) => {
          const statusDisplay = getStatusDisplay(monitor.id);
          const StatusIcon = statusDisplay.icon;

          return (
            <Link
              key={monitor.id}
              href={`/dashboard/monitors/${monitor.id}`}
              className="block"
            >
              <Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 hover:bg-neutral-800/50 transition-all duration-200 cursor-pointer group h-full">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`relative p-2.5 rounded-xl ${statusDisplay.bgColor}`}
                    >
                      <StatusIcon
                        className={`h-5 w-5 ${statusDisplay.color}`}
                      />
                      {statusDisplay.status === "up" && (
                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-400 rounded-full animate-pulse" />
                      )}
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-neutral-600 group-hover:text-green-400 transition-colors" />
                  </div>

                  <h3 className="font-semibold text-white group-hover:text-green-400 transition-colors truncate mb-1">
                    {monitor.name}
                  </h3>

                  <p className="text-sm text-neutral-400 truncate mb-3">
                    {monitor.url || monitor.hostname || "No endpoint"}
                  </p>

                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{monitor.interval}s</span>
                    </div>
                    {statusDisplay.ping && (
                      <span className="text-green-400 font-medium">
                        {statusDisplay.ping}ms
                      </span>
                    )}
                    {!monitor.active && (
                      <span className="px-1.5 py-0.5 rounded text-yellow-400 bg-yellow-500/20">
                        Paused
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
