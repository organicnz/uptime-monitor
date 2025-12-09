"use client";

import { useState } from "react";
import { MonitorSidebar } from "./monitor-sidebar";
import { MonitorDetailPanel } from "./monitor-detail-panel";
import { LiveMonitorsList } from "./live-monitors";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  LayoutGrid,
  LayoutList,
  Plus,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
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

type DashboardLayoutProps = {
  monitors: Monitor[];
};

type ViewMode = "detail" | "grid";

export function DashboardLayout({ monitors }: DashboardLayoutProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    monitors.length > 0 ? monitors[0].id : null,
  );

  const monitorIds = monitors.map((m) => m.id);
  const { statuses } = useRealtimeMonitors(monitorIds);

  const upCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "up",
  ).length;
  const downCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "down",
  ).length;
  const pendingCount = monitors.length - upCount - downCount;

  // Validate selection
  const getValidSelection = (currentId: string | null) => {
    if (monitors.length === 0) return null;
    if (currentId && monitors.find((m) => m.id === currentId)) return currentId;
    return monitors[0].id;
  };

  const validSelectedId = getValidSelection(selectedId);
  if (validSelectedId !== selectedId) {
    setSelectedId(validSelectedId);
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedId);

  // Empty state
  if (monitors.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="p-4 bg-green-500/10 rounded-2xl mb-4 inline-block">
            <Activity className="h-12 w-12 text-green-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No monitors yet</h3>
          <p className="text-neutral-400 mb-6 max-w-md">
            Create your first monitor to start tracking uptime and performance.
          </p>
          <Link href="/dashboard/monitors/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add New Monitor
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] -mx-4 lg:-mx-6 -my-8 flex flex-col overflow-hidden">
      {/* View Toggle Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-2 border-b border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("detail")}
            className={cn(
              "gap-2 h-8",
              viewMode === "detail"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white",
            )}
          >
            <LayoutList className="h-4 w-4" />
            <span className="hidden sm:inline">Detail</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("grid")}
            className={cn(
              "gap-2 h-8",
              viewMode === "grid"
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-white",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Grid</span>
          </Button>
        </div>

        {/* Quick stats in header */}
        <div className="hidden md:flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {upCount} Up
          </span>
          {downCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-400">
              <XCircle className="h-4 w-4" />
              {downCount} Down
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-neutral-400">
              <AlertCircle className="h-4 w-4" />
              {pendingCount} Pending
            </span>
          )}
        </div>

        {/* Only show Add button in grid view (sidebar has it in detail view) */}
        {viewMode === "grid" && (
          <Link href="/dashboard/monitors/new">
            <Button size="sm" className="gap-2 h-8">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Monitor</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Content */}
      {viewMode === "detail" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-72 lg:w-80 flex-shrink-0 border-r border-neutral-800">
            <MonitorSidebar
              monitors={monitors}
              selectedId={selectedId || undefined}
              onSelect={setSelectedId}
            />
          </div>

          {/* Detail Panel */}
          <div className="flex-1 overflow-hidden">
            {selectedMonitor ? (
              <MonitorDetailPanel
                key={selectedMonitor.id}
                monitor={selectedMonitor}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-400">
                Select a monitor to view details
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Total Monitors"
              value={monitors.length}
              icon={Activity}
              iconColor="text-blue-400"
              iconBg="bg-blue-500/10"
            />
            <StatsCard
              label="Operational"
              value={upCount}
              icon={CheckCircle2}
              iconColor="text-green-400"
              iconBg="bg-green-500/10"
              valueColor="text-green-400"
            />
            <StatsCard
              label="Down"
              value={downCount}
              icon={XCircle}
              iconColor="text-red-400"
              iconBg="bg-red-500/10"
              valueColor={downCount > 0 ? "text-red-400" : undefined}
            />
            <StatsCard
              label="Pending"
              value={pendingCount}
              icon={AlertCircle}
              iconColor="text-neutral-400"
              iconBg="bg-neutral-500/10"
            />
          </div>

          {/* Monitors Grid */}
          <LiveMonitorsList monitors={monitors} />
        </div>
      )}
    </div>
  );
}

function StatsCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  valueColor,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
}) {
  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-400">{label}</p>
            <p className={cn("text-2xl font-bold", valueColor)}>{value}</p>
          </div>
          <div className={cn("p-2.5 rounded-xl", iconBg)}>
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
