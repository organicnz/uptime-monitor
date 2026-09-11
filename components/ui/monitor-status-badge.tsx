import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Search } from "lucide-react";

const statusConfig = {
  0: {
    label: "Down",
    icon: AlertCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  1: {
    label: "Up",
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  2: {
    label: "Pending",
    icon: Search,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
};

const statusLabels: Record<number, string> = {
  0: "Down",
  1: "Up",
  2: "Pending",
};

export function MonitorStatusBadge({ status }: { status: number }) {
  const config =
    statusConfig[status as keyof typeof statusConfig] || statusConfig[0];
  const Icon = config.icon;
  const label =
    statusLabels[status as keyof typeof statusLabels] || config.label;

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.bg,
        config.color,
        config.border,
      )}
      aria-label={`${config.label} - ${label}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
