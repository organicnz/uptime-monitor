"use client";

import { useState } from "react";
import { MonitorSidebar } from "./monitor-sidebar";
import { MonitorDetailPanel } from "./monitor-detail-panel";
import { Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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

export function DashboardLayout({ monitors }: DashboardLayoutProps) {
  // Compute initial selection - if current selection is invalid, use first monitor
  const getValidSelection = (currentId: string | null) => {
    if (monitors.length === 0) return null;
    if (currentId && monitors.find((m) => m.id === currentId)) return currentId;
    return monitors[0].id;
  };

  const [selectedId, setSelectedId] = useState<string | null>(() =>
    getValidSelection(null),
  );

  // Update selection if monitors change and current selection is invalid
  const validSelectedId = getValidSelection(selectedId);
  if (validSelectedId !== selectedId) {
    setSelectedId(validSelectedId);
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedId);

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
    <div className="flex h-[calc(100vh-8rem)] -mx-4 lg:-mx-6 -my-8 overflow-hidden">
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
          <MonitorDetailPanel monitor={selectedMonitor} />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400">
            Select a monitor to view details
          </div>
        )}
      </div>
    </div>
  );
}
