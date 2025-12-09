"use client";

import { useState } from "react";
import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  interval: number;
  active: boolean;
};

type MonitorSidebarProps = {
  monitors: Monitor[];
  selectedId?: string;
  onSelect: (id: string) => void;
};

export function MonitorSidebar({
  monitors,
  selectedId,
  onSelect,
}: MonitorSidebarProps) {
  const [search, setSearch] = useState("");
  const monitorIds = monitors.map((m) => m.id);
  const { statuses } = useRealtimeMonitors(monitorIds);

  const filteredMonitors = monitors.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  const getUptimeDisplay = (monitorId: string) => {
    const status = statuses.get(monitorId);
    if (!status) return { percentage: null, isUp: null };
    return {
      percentage: status.status === "up" ? 100 : 0,
      isUp: status.status === "up",
    };
  };

  const getHeartbeatBars = (monitorId: string) => {
    const status = statuses.get(monitorId);
    const isUp = status?.status === "up";
    const isDown = status?.status === "down";
    return Array(20).fill(isUp ? "up" : isDown ? "down" : "pending");
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900/50 border-r border-neutral-800">
      {/* Add Monitor Button */}
      <div className="p-3 border-b border-neutral-800">
        <Link href="/dashboard/monitors/new">
          <Button className="w-full gap-2" size="sm">
            <Plus className="h-4 w-4" />
            Add New Monitor
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-neutral-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-neutral-800/50 border-neutral-700"
          />
        </div>
      </div>

      {/* Monitor List */}
      <div className="flex-1 overflow-y-auto">
        {filteredMonitors.map((monitor) => {
          const uptime = getUptimeDisplay(monitor.id);
          const bars = getHeartbeatBars(monitor.id);
          const isSelected = selectedId === monitor.id;

          return (
            <button
              key={monitor.id}
              onClick={() => onSelect(monitor.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2",
                isSelected
                  ? "bg-neutral-800/50 border-l-green-500"
                  : "border-l-transparent hover:bg-neutral-800/30",
              )}
            >
              {/* Uptime Badge */}
              <div
                className={cn(
                  "flex-shrink-0 px-2 py-0.5 rounded text-xs font-semibold min-w-[45px] text-center",
                  uptime.isUp === true && "bg-green-500/20 text-green-400",
                  uptime.isUp === false && "bg-red-500/20 text-red-400",
                  uptime.isUp === null && "bg-neutral-500/20 text-neutral-400",
                )}
              >
                {uptime.percentage !== null ? `${uptime.percentage}%` : "—"}
              </div>

              {/* Monitor Name */}
              <span className="flex-1 truncate text-sm font-medium">
                {monitor.name}
              </span>

              {/* Heartbeat Bars */}
              <div className="flex gap-[2px] flex-shrink-0">
                {bars.slice(-15).map((status, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-[3px] h-4 rounded-sm",
                      status === "up" && "bg-green-500",
                      status === "down" && "bg-red-500",
                      status === "pending" && "bg-neutral-600",
                    )}
                  />
                ))}
              </div>
            </button>
          );
        })}

        {filteredMonitors.length === 0 && (
          <div className="p-4 text-center text-sm text-neutral-400">
            No monitors found
          </div>
        )}
      </div>
    </div>
  );
}
