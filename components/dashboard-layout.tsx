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

  // Get realtime statuses for stats calculation
  const monitorIds = monitors.map((m) => m.id);
  const { statuses } = useRealtimeMonitors(monitorIds);

  // Calculate stats from realtime data
  const upCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "up",
  ).length;
  const downCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "down",
  ).length;
  const pendingCount = monitors.length - upCount - downCount;

  // Update selection if monitors change and current selection is invalid
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
            <Button>Add New Monitor</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] -mx-4 lg:-mx-6 -my-8 flex flex-col overflow-hidden">
      {/* View Toggle Header */}
      <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-neutral-800 bg-background/50 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "detail" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("detail")}
            className="gap-2"
          >
            <LayoutList className="h-4 w-4" />
            <span className="hidden sm:inline">Detail View</span>
          </Button>
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="gap-2"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Grid View</span>
          </Button>
        </div>
        <Link href="/dashboard/monitors/new">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Monitor</span>
          </Button>
        </Link>
      </div>

      {/* Content */}
      {viewMode === "detail" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-80 flex-shrink-0 border-r border-neutral-800">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              label="Total Monitors"
              value={monitors.length}
              icon={Activity}
              iconColor="text-blue-500"
              iconBg="bg-blue-500/10"
            />
            <StatsCard
              label="Operational"
              value={upCount}
              icon={CheckCircle2}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
              valueColor="text-emerald-500"
            />
            <StatsCard
              label="Down"
              value={downCount}
              icon={XCircle}
              iconColor="text-red-500"
              iconBg="bg-red-500/10"
              valueColor={downCount > 0 ? "text-red-500" : undefined}
            />
            <StatsCard
              label="Pending"
              value={pendingCount}
              icon={AlertCircle}
              iconColor="text-muted-foreground"
              iconBg="bg-muted"
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
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold ${valueColor || ""}`}>{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
