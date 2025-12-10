"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Calendar, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

type Maintenance = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  strategy: string | null;
};

type MaintenanceFormProps = {
  maintenance?: Maintenance;
  monitors: Monitor[];
  assignedMonitorIds?: string[];
  action: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
};

export function MaintenanceForm({
  maintenance,
  monitors,
  assignedMonitorIds = [],
  action,
}: MaintenanceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedMonitors, setSelectedMonitors] =
    useState<string[]>(assignedMonitorIds);
  const [isActive, setIsActive] = useState(maintenance?.active ?? true);

  // Default to current datetime + 1 hour rounded to nearest hour
  const defaultStartDate = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    return now.toISOString().slice(0, 16);
  };

  // Default end is 2 hours after start
  const defaultEndDate = () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 3);
    return now.toISOString().slice(0, 16);
  };

  const handleSubmit = (formData: FormData) => {
    // Add selected monitors to form data
    selectedMonitors.forEach((id) => {
      formData.append("monitor_ids", id);
    });

    // Add active state
    formData.set("active", isActive.toString());

    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(
          maintenance ? "Maintenance updated" : "Maintenance scheduled",
        );
      } else {
        toast.error(result.error || "Something went wrong");
      }
    });
  };

  const toggleMonitor = (monitorId: string) => {
    setSelectedMonitors((prev) =>
      prev.includes(monitorId)
        ? prev.filter((id) => id !== monitorId)
        : [...prev, monitorId],
    );
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Maintenance Details
          </CardTitle>
          <CardDescription>
            Provide a title and optional description for this maintenance window
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={maintenance?.title}
              placeholder="Server maintenance"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              defaultValue={maintenance?.description || ""}
              placeholder="Scheduled database migration..."
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Active</Label>
              <p className="text-xs text-muted-foreground">
                Disabled windows will not pause monitoring
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </CardContent>
      </Card>

      {/* Schedule */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule
          </CardTitle>
          <CardDescription>
            When should this maintenance window be active?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date & Time *</Label>
              <Input
                id="start_date"
                name="start_date"
                type="datetime-local"
                defaultValue={
                  maintenance?.start_date
                    ? new Date(maintenance.start_date)
                        .toISOString()
                        .slice(0, 16)
                    : defaultStartDate()
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date & Time *</Label>
              <Input
                id="end_date"
                name="end_date"
                type="datetime-local"
                defaultValue={
                  maintenance?.end_date
                    ? new Date(maintenance.end_date).toISOString().slice(0, 16)
                    : defaultEndDate()
                }
                required
              />
            </div>
          </div>
          <input type="hidden" name="strategy" value="manual" />
        </CardContent>
      </Card>

      {/* Monitor Selection */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Affected Monitors</CardTitle>
          <CardDescription>
            Select which monitors should pause alerting during this maintenance
            window
          </CardDescription>
        </CardHeader>
        <CardContent>
          {monitors.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {monitors.map((monitor) => (
                <button
                  key={monitor.id}
                  type="button"
                  onClick={() => toggleMonitor(monitor.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                    selectedMonitors.includes(monitor.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:bg-muted/50",
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center",
                      selectedMonitors.includes(monitor.id)
                        ? "border-primary bg-primary"
                        : "border-muted-foreground",
                    )}
                  >
                    {selectedMonitors.includes(monitor.id) && (
                      <svg
                        className="h-3 w-3 text-primary-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {monitor.name}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {monitor.type}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No monitors available. Create some monitors first.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {maintenance ? "Updating..." : "Creating..."}
            </>
          ) : maintenance ? (
            "Update Maintenance"
          ) : (
            "Schedule Maintenance"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
