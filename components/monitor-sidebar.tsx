"use client";

import { useState } from "react";
import { useMonitorsWithHistory } from "@/hooks/use-monitors-with-history";
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
  const { monitors: monitorData, isConnected } =
    useMonitorsWithHistory(monitorIds);

  const filteredMonitors = monitors.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full bg-neutral-900/50">
      {/* Add Monitor Button */}
      <div className="p-3 border-b border-neutral-800">
        <Link href="/dashboard/monitors/new">
          <Button
            className="w-full gap-2 bg-green-600 hover:bg-green-700"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Add New Monitor
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-neutral-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-neutral-800/50 border-neutral-700 text-sm"
          />
        </div>
      </div>

      {/* Connection indicator */}
      <div className="px-3 py-1.5 border-b border-neutral-800 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            isConnected ? "bg-green-500 animate-pulse" : "bg-neutral-600",
          )}
        />
        <span className={isConnected ? "text-green-400" : "text-neutral-500"}>
          {isConnected ? "Live" : "Connecting..."}
        </span>
      </div>

      {/* Monitor List */}
      <div className="flex-1 overflow-y-auto">
        {filteredMonitors.map((monitor) => {
          const data = monitorData.get(monitor.id);
          const isSelected = selectedId === monitor.id;
          const heartbeats = data?.heartbeats || [];
          const uptimePercent = data?.uptimePercent ?? null;
          const isUp = data?.status === "up";
          const isDown = data?.status === "down";

          return (
            <button
              key={monitor.id}
              onClick={() => onSelect(monitor.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2",
                isSelected
                  ? "bg-neutral-800/70 border-l-green-500"
                  : "border-l-transparent hover:bg-neutral-800/40",
              )}
            >
              {/* Uptime Badge */}
              <div
                className={cn(
                  "flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold min-w-[48px] text-center",
                  isUp && "bg-green-500/20 text-green-400",
                  isDown && "bg-red-500/20 text-red-400",
                  !isUp && !isDown && "bg-neutral-700 text-neutral-400",
                )}
              >
                {uptimePercent !== null ? `${uptimePercent}%` : "—"}
              </div>

              {/* Monitor Name */}
              <span className="flex-1 truncate text-sm font-medium">
                {monitor.name}
              </span>

              {/* Heartbeat Bars - show last 20 */}
              <div className="flex gap-[2px] flex-shrink-0">
                {heartbeats.length > 0
                  ? heartbeats
                      .slice(0, 20)
                      .reverse()
                      .map((hb, i) => (
                        <div
                          key={hb.id || i}
                          className={cn(
                            "w-[3px] h-[18px] rounded-sm",
                            hb.status === 1 && "bg-green-500",
                            hb.status === 0 && "bg-red-500",
                            hb.status === 2 && "bg-neutral-600",
                          )}
                        />
                      ))
                  : // Placeholder bars when no data
                    Array(20)
                      .fill(0)
                      .map((_, i) => (
                        <div
                          key={i}
                          className="w-[3px] h-[18px] rounded-sm bg-neutral-700"
                        />
                      ))}
              </div>
            </button>
          );
        })}

        {filteredMonitors.length === 0 && (
          <div className="p-4 text-center text-sm text-neutral-500">
            No monitors found
          </div>
        )}
      </div>
    </div>
  );
}
