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
  PanelLeftClose,
  PanelLeft,
  ChevronLeft,
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
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

  const handleSelectMonitor = (id: string) => {
    setSelectedId(id);
    setMobileSidebarOpen(false);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* View Toggle Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 lg:px-6 py-2 glass-header">
        <div className="flex items-center gap-1">
          {/* Sidebar toggle for detail view */}
          {viewMode === "detail" && (
            <>
              {/* Desktop sidebar toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden md:flex h-8 w-8 p-0 text-neutral-400 hover:text-white"
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeft className="h-4 w-4" />
                )}
              </Button>
              {/* Mobile sidebar toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
                className="md:hidden h-8 w-8 p-0 text-neutral-400 hover:text-white"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </>
          )}
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
        <div className="hidden sm:flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
          <span className="flex items-center gap-1 sm:gap-1.5 text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {upCount} Up
          </span>
          {downCount > 0 && (
            <span className="flex items-center gap-1 sm:gap-1.5 text-red-400">
              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {downCount} Down
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 sm:gap-1.5 text-neutral-400">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {pendingCount} Pending
            </span>
          )}
        </div>

        {/* Add button - show in grid view or when sidebar is hidden in detail view */}
        {(viewMode === "grid" || (viewMode === "detail" && !sidebarOpen)) && (
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
        <div className="flex flex-1 overflow-hidden relative">
          {/* Mobile Sidebar Overlay */}
          {mobileSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}

          {/* Sidebar - Desktop: collapsible, Mobile: slide-over */}
          <div
            className={cn(
              "flex-shrink-0 glass-sidebar transition-all duration-300",
              // Desktop behavior
              "hidden md:block",
              sidebarOpen ? "w-72 lg:w-80" : "w-0 border-r-0 overflow-hidden",
            )}
          >
            <MonitorSidebar
              monitors={monitors}
              selectedId={selectedId || undefined}
              onSelect={setSelectedId}
            />
          </div>

          {/* Mobile Sidebar - Slide over */}
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] glass-sidebar transform transition-transform duration-300 ease-in-out md:hidden",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <span className="font-medium">Monitors</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileSidebarOpen(false)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-49px)]">
              <MonitorSidebar
                monitors={monitors}
                selectedId={selectedId || undefined}
                onSelect={handleSelectMonitor}
              />
            </div>
          </div>

          {/* Detail Panel */}
          <div className="flex-1 overflow-hidden min-w-0">
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
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
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
    <Card className="glass-stats rounded-xl">
      <CardContent className="p-3 sm:pt-5 sm:pb-4 sm:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-neutral-400 truncate">
              {label}
            </p>
            <p className={cn("text-xl sm:text-2xl font-bold", valueColor)}>
              {value}
            </p>
          </div>
          <div
            className={cn(
              "p-2 sm:p-2.5 rounded-lg sm:rounded-xl flex-shrink-0 backdrop-blur-sm",
              iconBg,
            )}
          >
            <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
