"use client";

import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Globe,
  Server,
  Zap,
  Search,
  Radio,
  MoreVertical,
  Copy,
  Settings,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { duplicateMonitor } from "@/lib/actions/monitors";
import { toast } from "sonner";

type Monitor = {
  id: string;
  name: string;
  url: string | null;
  hostname: string | null;
  type: string;
  interval: number;
  active: boolean;
};

type LiveMonitorsListProps = {
  monitors: Monitor[];
};

const typeIcons: Record<string, typeof Globe> = {
  http: Globe,
  https: Globe,
  tcp: Server,
  ping: Zap,
  keyword: Search,
  dns: Radio,
};

export function LiveMonitorsList({ monitors }: LiveMonitorsListProps) {
  const router = useRouter();
  const [isDuplicating, startDuplicateTransition] = useTransition();
  const monitorIds = monitors.map((m) => m.id);
  const { statuses, isConnected, lastUpdate } = useRealtimeMonitors(monitorIds);

  const handleDuplicate = (monitorId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startDuplicateTransition(async () => {
      const result = await duplicateMonitor(monitorId);
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

  const getStatusDisplay = (monitorId: string) => {
    const status = statuses.get(monitorId);
    if (!status) {
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
    };

    const config = configs[status.status];
    return {
      ...config,
      status: status.status,
      ping: status.ping,
      lastCheck: status.lastCheck,
    };
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <div className="relative">
                <Wifi className="h-4 w-4 text-emerald-500" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
              </div>
              <span className="text-emerald-500 font-medium">
                Live updates active
              </span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Connecting...</span>
            </>
          )}
        </div>
        {lastUpdate && (
          <span className="text-muted-foreground text-xs">
            Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Monitors Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {monitors.map((monitor) => {
          const statusDisplay = getStatusDisplay(monitor.id);
          const StatusIcon = statusDisplay.icon;
          const TypeIcon = typeIcons[monitor.type] || Globe;
          const isUp = statusDisplay.status === "up";
          const isDown = statusDisplay.status === "down";

          return (
            <div key={monitor.id} className="relative group">
              <Link
                href={`/dashboard/monitors/${monitor.id}`}
                className="block"
              >
                <Card
                  className={cn(
                    "bg-neutral-900/40 backdrop-blur-xl border-white/5 hover:bg-neutral-900/60 transition-all duration-300 h-full",
                    statusDisplay.borderColor,
                    isUp && "status-glow-up",
                    isDown && "status-glow-down",
                  )}
                >
                  <CardContent className="p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className={cn(
                          "relative p-2.5 rounded-xl transition-transform group-hover:scale-110",
                          statusDisplay.bgColor,
                        )}
                      >
                        <StatusIcon
                          className={cn("h-5 w-5", statusDisplay.color)}
                        />
                        {isUp && (
                          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-500 rounded-full animate-pulse" />
                        )}
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>

                    {/* Name & URL */}
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate mb-1">
                      {monitor.name}
                    </h3>
                    <p className="text-sm text-muted-foreground truncate mb-4">
                      {monitor.url || monitor.hostname || "No endpoint"}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <TypeIcon className="h-3.5 w-3.5" />
                          <span className="uppercase">{monitor.type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
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
                          <span className="px-2 py-0.5 rounded-full text-amber-500 bg-amber-500/10 font-medium">
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
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-neutral-900/80 hover:bg-neutral-800"
                    onClick={(e) => e.preventDefault()}
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
                  <DropdownMenuItem
                    onClick={(e) =>
                      handleDuplicate(
                        monitor.id,
                        e as unknown as React.MouseEvent,
                      )
                    }
                    disabled={isDuplicating}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>
    </div>
  );
}
