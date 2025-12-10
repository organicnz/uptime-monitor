"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Monitor = {
  id: string;
  name: string;
  type: string;
};

type Incident = {
  id: string;
  monitor_id: string;
  title: string;
  content: string | null;
  status: number;
};

type IncidentFormProps = {
  incident?: Incident;
  monitors: Monitor[];
  action: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
};

const statusOptions = [
  { value: "0", label: "Open", color: "text-red-500" },
  { value: "2", label: "Investigating", color: "text-amber-500" },
  { value: "1", label: "Resolved", color: "text-emerald-500" },
];

export function IncidentForm({
  incident,
  monitors,
  action,
}: IncidentFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedMonitor, setSelectedMonitor] = useState(
    incident?.monitor_id || "",
  );
  const [status, setStatus] = useState(incident?.status?.toString() || "0");

  const handleSubmit = (formData: FormData) => {
    formData.set("monitor_id", selectedMonitor);
    formData.set("status", status);

    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        toast.success(incident ? "Incident updated" : "Incident created");
        router.push("/dashboard/incidents");
      } else {
        toast.error(result.error || "Something went wrong");
      }
    });
  };

  return (
    <form action={handleSubmit} className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Incident Details
          </CardTitle>
          <CardDescription>
            {incident
              ? "Update the incident information"
              : "Report a new incident for a monitored service"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Monitor Selection */}
          <div className="space-y-2">
            <Label>Affected Monitor *</Label>
            <Select
              value={selectedMonitor}
              onValueChange={setSelectedMonitor}
              disabled={!!incident}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a monitor" />
              </SelectTrigger>
              <SelectContent>
                {monitors.map((monitor) => (
                  <SelectItem key={monitor.id} value={monitor.id}>
                    <span className="flex items-center gap-2">
                      {monitor.name}
                      <span className="text-xs text-muted-foreground uppercase">
                        {monitor.type}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={incident?.title}
              placeholder="Brief description of the incident"
              required
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Description</Label>
            <textarea
              id="content"
              name="content"
              defaultValue={incident?.content || ""}
              placeholder="Detailed information about the incident, what's affected, and expected resolution..."
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(option.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
                    status === option.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 hover:bg-muted/50 text-muted-foreground",
                  )}
                >
                  <span className={status === option.value ? option.color : ""}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button
          type="submit"
          disabled={isPending || !selectedMonitor}
          className="gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {incident ? "Updating..." : "Creating..."}
            </>
          ) : incident ? (
            "Update Incident"
          ) : (
            "Create Incident"
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
