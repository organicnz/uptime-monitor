"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  LayoutGrid,
  LayoutList,
  PanelLeft,
  PanelLeftClose,
  Plus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { cn } from "@/lib/utils";

import { LiveMonitorsList } from "./live-monitors";
import { MonitorDetailPanel } from "./monitor-detail-panel";
import { MonitorSidebar } from "./monitor-sidebar";

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

  const monitorIds = useMemo(() => monitors.map((m) => m.id), [monitors]);
  const { statuses } = useRealtimeMonitors(monitorIds);

  const upCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "up",
  ).length;
  const downCount = monitors.filter(
    (m) => statuses.get(m.id)?.status === "down",
  ).length;
  const pendingCount = monitors.length - upCount - downCount;

  // Validate selection against the current monitor list. Derived (not synced
  // via setState) so list changes can never cause render-phase update loops.
  const validSelectedId = useMemo(() => {
    if (monitors.length === 0) return null;
    if (selectedId && monitors.some((m) => m.id === selectedId)) {
      return selectedId;
    }
    return monitors[0].id;
  }, [monitors, selectedId]);

  const selectedMonitor = monitors.find((m) => m.id === validSelectedId);

  // Empty state
  if (monitors.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block rounded-2xl bg-green-500/10 p-4">
            <Activity className="h-12 w-12 text-green-400" />
          </div>
          <h3 className="mb-2 text-xl font-semibold">No monitors yet</h3>
          <p className="mb-6 max-w-md text-neutral-400">
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
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* View Toggle Header */}
      <div className="glass-header flex items-center justify-between px-3 py-2 sm:px-4 lg:px-6">
        <div className="flex items-center gap-1">
          {/* Sidebar toggle for detail view */}
          {viewMode === "detail" && (
            <>
              {/* Desktop sidebar toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden h-8 w-8 p-0 text-neutral-400 hover:text-white md:flex"
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
                className="h-8 w-8 p-0 text-neutral-400 hover:text-white md:hidden"
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
              "h-8 gap-2",
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
              "h-8 gap-2",
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
        <div className="hidden items-center gap-2 text-xs sm:flex sm:gap-4 sm:text-sm">
          <span className="flex items-center gap-1 text-green-400 sm:gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {upCount} Up
          </span>
          {downCount > 0 && (
            <span className="flex items-center gap-1 text-red-400 sm:gap-1.5">
              <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {downCount} Down
            </span>
          )}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 text-neutral-400 sm:gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {pendingCount} Pending
            </span>
          )}
        </div>

        {/* Add button - show in grid view or when sidebar is hidden in detail view */}
        {(viewMode === "grid" || (viewMode === "detail" && !sidebarOpen)) && (
          <Link href="/dashboard/monitors/new">
            <Button size="sm" className="h-8 gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Monitor</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Content */}
      {viewMode === "detail" ? (
        <div className="relative flex flex-1 overflow-hidden">
          {/* Mobile Sidebar Overlay */}
          {mobileSidebarOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              className="fixed inset-0 z-40 border-0 bg-black/60 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}

          {/* Sidebar - Desktop: collapsible, Mobile: slide-over */}
          <div
            className={cn(
              "glass-sidebar flex-shrink-0 transition-all duration-300",
              // Desktop behavior
              "hidden md:block",
              sidebarOpen ? "w-72 lg:w-80" : "w-0 overflow-hidden border-r-0",
            )}
          >
            <MonitorSidebar
              monitors={monitors}
              selectedId={validSelectedId || undefined}
              onSelect={setSelectedId}
            />
          </div>

          {/* Mobile Sidebar - Slide over */}
          <div
            className={cn(
              "glass-sidebar fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] transform transition-transform duration-300 ease-in-out md:hidden",
              mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex items-center justify-between border-b border-white/5 p-3">
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
                selectedId={validSelectedId || undefined}
                onSelect={handleSelectMonitor}
              />
            </div>
          </div>

          {/* Detail Panel */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {selectedMonitor ? (
              <MonitorDetailPanel
                key={selectedMonitor.id}
                monitor={selectedMonitor}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-neutral-400">
                Select a monitor to view details
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-auto p-3 sm:space-y-6 sm:p-4 lg:p-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
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
      <CardContent className="p-3 sm:px-4 sm:pt-5 sm:pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-neutral-400 sm:text-sm">
              {label}
            </p>
            <p className={cn("text-xl font-bold sm:text-2xl", valueColor)}>
              {value}
            </p>
          </div>
          <div
            className={cn(
              "flex-shrink-0 rounded-lg p-2 backdrop-blur-sm sm:rounded-xl sm:p-2.5",
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
