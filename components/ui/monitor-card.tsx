"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  MoreVertical,
  Settings,
  Wrench,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { duplicateMonitor } from "@/lib/actions/monitors";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  interval: number;
  active: boolean;
  status?: "up" | "down" | "pending" | "degraded" | "maintenance";
  ping?: number | null;
  tags?: string[];
};

type MonitorCardProps = {
  monitor: Monitor;
  onViewDetail?: (id: string) => void;
};

export function MonitorCard({ monitor }: MonitorCardProps) {
  const router = useRouter();
  const [isDuplicating, startDuplicateTransition] = useTransition();

  const getStatusDisplay = () => {
    if (!monitor.status) {
      return {
        status: "pending" as const,
        color: "text-muted-foreground",
        bgColor: "bg-muted",
        borderColor: "border-border",
        icon: AlertCircle,
        label: "Pending",
        ping: null,
      };
    }

    const configs = {
      up: {
        color: "text-emerald-500",
        bgColor: "bg-emerald-500/10",
        borderColor: "border-emerald-500/30 hover:border-emerald-500/50",
        icon: CheckCircle2,
        label: "Operational",
      },
      down: {
        color: "text-red-500",
        bgColor: "bg-red-500/10",
        borderColor: "border-red-500/30 hover:border-red-500/50",
        icon: XCircle,
        label: "Down",
      },
      pending: {
        color: "text-muted-foreground",
        bgColor: "bg-muted",
        borderColor: "border-border",
        icon: AlertCircle,
        label: "Pending",
      },
      degraded: {
        color: "text-amber-500",
        bgColor: "bg-amber-500/10",
        borderColor: "border-amber-500/30 hover:border-amber-500/50",
        icon: AlertTriangle,
        label: "Degraded",
      },
      maintenance: {
        color: "text-sky-400",
        bgColor: "bg-sky-500/10",
        borderColor: "border-sky-500/30 hover:border-sky-500/50",
        icon: Wrench,
        label: "Maintenance",
      },
    };

    const config = configs[monitor.status];
    return {
      ...config,
      status: monitor.status,
      ping: monitor.ping,
    };
  };

  const statusDisplay = getStatusDisplay();

  const handleDuplicate = () => {
    startDuplicateTransition(async () => {
      const result = await duplicateMonitor(monitor.id);
      if (result.success) {
        toast.success(`Created "${result.name}"`, {
          description:
            "The duplicate is paused. Review settings before activating.",
          action: {
            label: "View",
            onClick: () => router.push(`/dashboard/monitors/${result.id}`),
          },
        });
      } else {
        toast.error("Failed to duplicate", {
          description: result.error,
        });
      }
    });
  };

  return (
    <div
      key={monitor.id}
      role="article"
      className="group relative"
      aria-label={`Monitor: ${monitor.name}`}
    >
      <Link
        href={`/dashboard/monitors/${monitor.id}`}
        className="block"
        aria-label={`View monitor details for ${monitor.name}`}
      >
        <Card
          className={cn(
            "h-full border-white/5 bg-neutral-900/40 backdrop-blur-xl transition-all duration-300 hover:bg-neutral-900/60",
            statusDisplay.bgColor,
            monitor.status === "up" && "status-glow-up",
            monitor.status === "down" && "status-glow-down",
          )}
        >
          <CardContent className="p-5">
            {/* Header */}
            <div className="mb-4 flex items-start justify-between">
              <div
                role="img"
                aria-label={statusDisplay.label}
                className={cn(
                  "relative rounded-xl p-2.5 transition-transform group-hover:scale-110",
                  statusDisplay.bgColor,
                )}
              >
                <statusDisplay.icon
                  className={cn("h-5 w-5", statusDisplay.color)}
                />
                {monitor.status === "up" && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                )}
              </div>
              <svg
                className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>

            {/* Name & URL */}
            <h3
              className="mb-1 truncate font-semibold text-foreground transition-colors group-hover:text-primary"
              aria-label={`${monitor.name} monitor`}
            >
              {monitor.name}
            </h3>
            <p
              className="mb-4 truncate text-sm text-muted-foreground"
              aria-label={`${
                monitor.url || monitor.hostname || "No endpoint"
              } endpoint`}
            >
              {monitor.url || monitor.hostname || "No endpoint"}
            </p>

            {/* Tags */}
            {monitor.tags && monitor.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {monitor.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <statusDisplay.icon className="h-3.5 w-3.5" />
                  <span className="uppercase">{monitor.type}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>{monitor.interval}s</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {statusDisplay.ping && (
                  <span className="font-medium text-emerald-500">
                    {statusDisplay.ping}ms
                  </span>
                )}
                {!monitor.active && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-500">
                    Paused
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Actions Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 bg-neutral-900/80 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-800"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/monitors/${monitor.id}`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/monitors/${monitor.id}/edit`}>
              <Settings className="mr-2 h-4 w-4" />
              Edit Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDuplicate} disabled={isDuplicating}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
