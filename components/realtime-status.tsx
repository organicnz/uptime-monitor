"use client";

import { useRealtimeMonitor } from "@/hooks/use-realtime-monitors";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

interface RealtimeStatusProps {
  monitorId: string;
  showConnection?: boolean;
}

export function RealtimeStatus({
  monitorId,
  showConnection = false,
}: RealtimeStatusProps) {
  const { currentStatus, isConnected } = useRealtimeMonitor(monitorId);

  if (!currentStatus) {
    return (
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-neutral-400" />
        <span className="text-sm text-neutral-400">Waiting for data...</span>
      </div>
    );
  }

  const statusConfig = {
    up: {
      icon: CheckCircle2,
      color: "text-green-400",
      bg: "bg-green-500/20",
      label: "Operational",
    },
    down: {
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-500/20",
      label: "Down",
    },
    pending: {
      icon: AlertCircle,
      color: "text-neutral-400",
      bg: "bg-neutral-500/20",
      label: "Pending",
    },
  };

  const config = statusConfig[currentStatus.status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-3">
      <div className={`relative p-2 rounded-lg ${config.bg}`}>
        <Icon className={`h-5 w-5 ${config.color}`} />
        {currentStatus.status === "up" && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-400 rounded-full animate-pulse" />
        )}
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${config.color}`}>{config.label}</span>
          {currentStatus.ping && (
            <span className="text-sm text-neutral-400">
              {currentStatus.ping}ms
            </span>
          )}
        </div>
        {currentStatus.lastCheck && (
          <p className="text-xs text-neutral-500">
            {formatDistanceToNow(new Date(currentStatus.lastCheck), {
              addSuffix: true,
            })}
          </p>
        )}
      </div>
      {showConnection && (
        <div
          className="ml-auto"
          title={isConnected ? "Live updates active" : "Connecting..."}
        >
          {isConnected ? (
            <Wifi className="h-4 w-4 text-green-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-neutral-500" />
          )}
        </div>
      )}
    </div>
  );
}

interface RealtimeHeartbeatChartProps {
  monitorId: string;
  maxBars?: number;
}

export function RealtimeHeartbeatChart({
  monitorId,
  maxBars = 30,
}: RealtimeHeartbeatChartProps) {
  const { heartbeats, isConnected } = useRealtimeMonitor(monitorId);

  const displayHeartbeats = heartbeats.slice(0, maxBars).reverse();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>Recent checks</span>
        <div className="flex items-center gap-1">
          {isConnected ? (
            <>
              <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
              <span>Live</span>
            </>
          ) : (
            <span>Connecting...</span>
          )}
        </div>
      </div>
      <div className="flex items-end gap-0.5 h-12">
        {displayHeartbeats.length > 0
          ? displayHeartbeats.map((hb, i) => {
              const height =
                hb.status === 1
                  ? "h-full"
                  : hb.status === 0
                    ? "h-full"
                    : "h-1/3";
              const color =
                hb.status === 1
                  ? "bg-green-500"
                  : hb.status === 0
                    ? "bg-red-500"
                    : "bg-neutral-600";

              return (
                <div
                  key={hb.id || i}
                  className={`w-2 rounded-sm ${height} ${color} transition-all duration-300`}
                  title={`${hb.status === 1 ? "Up" : hb.status === 0 ? "Down" : "Pending"} - ${hb.ping || 0}ms - ${new Date(hb.time).toLocaleString()}`}
                />
              );
            })
          : // Placeholder bars
            Array.from({ length: maxBars }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-1/3 bg-neutral-700 rounded-sm animate-pulse"
                style={{ animationDelay: `${i * 50}ms` }}
              />
            ))}
      </div>
    </div>
  );
}
