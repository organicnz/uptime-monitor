"use client";

import { AlertTriangle, CheckCircle2, Search } from "lucide-react";

import { cn } from "@/lib/utils";

const statusConfig = {
  0: {
    label: "Open",
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  1: {
    label: "Resolved",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  2: {
    label: "Investigating",
    icon: Search,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
};

export function IncidentStatusBadge({ status }: { status: number }) {
  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig[0];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.bg,
        config.color,
        config.border,
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
