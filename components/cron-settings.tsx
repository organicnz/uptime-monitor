"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Pause,
  Play,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const RETRY_OPTIONS = [
  { value: "0", label: "No retries" },
  { value: "1", label: "1 retry" },
  { value: "2", label: "2 retries" },
  { value: "3", label: "3 retries (default)" },
  { value: "4", label: "4 retries" },
  { value: "5", label: "5 retries (max)" },
];

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC (default)" },
  { value: "Pacific/Auckland", label: "Pacific/Auckland (NZST)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (AEST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET)" },
  { value: "America/New_York", label: "America/New_York (EST)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST)" },
];

type Schedule = {
  id: string;
  cron: string;
  intervalMinutes: number;
  destination: string;
  isPaused: boolean;
  createdAt: number;
  retries: number;
  failureCallback?: string;
  timezone?: string;
};

const INTERVAL_OPTIONS = [
  { value: "1", label: "Every 1 minute", dailyMessages: 1440 },
  { value: "2", label: "Every 2 minutes", dailyMessages: 720 },
  { value: "3", label: "Every 3 minutes", dailyMessages: 480 },
  { value: "5", label: "Every 5 minutes", dailyMessages: 288 },
  { value: "10", label: "Every 10 minutes", dailyMessages: 144 },
  { value: "15", label: "Every 15 minutes", dailyMessages: 96 },
  { value: "30", label: "Every 30 minutes", dailyMessages: 48 },
  { value: "60", label: "Every 1 hour", dailyMessages: 24 },
];

export function CronSettings() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState("2");
  const [selectedRetries, setSelectedRetries] = useState("3");
  const [selectedTimezone, setSelectedTimezone] = useState("UTC");
  const [failureCallback, setFailureCallback] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/settings/schedule");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch schedule");
      }

      if (data.schedule) {
        setSchedule(data.schedule);
        setSelectedInterval(String(data.schedule.intervalMinutes));
        setSelectedRetries(String(data.schedule.retries ?? 3));
        setSelectedTimezone(data.schedule.timezone || "UTC");
        setFailureCallback(data.schedule.failureCallback || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const handleIntervalChange = async (value: string) => {
    if (!schedule) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          intervalMinutes: parseInt(value, 10),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update schedule");
      }

      setSelectedInterval(value);
      toast.success(
        `Schedule updated to every ${value} minute${value === "1" ? "" : "s"}`,
      );

      // Refresh to get new schedule ID
      await fetchSchedule();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update schedule",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePauseResume = async () => {
    if (!schedule) return;

    setSaving(true);
    const action = schedule.isPaused ? "resume" : "pause";

    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          action,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} schedule`);
      }

      setSchedule({ ...schedule, isPaused: !schedule.isPaused });
      toast.success(`Schedule ${action}d`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${action} schedule`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRetriesChange = async (value: string) => {
    if (!schedule) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          retries: parseInt(value, 10),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update retries");

      setSelectedRetries(value);
      toast.success(`Retries updated to ${value}`);
      await fetchSchedule();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update retries",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTimezoneChange = async (value: string) => {
    if (!schedule) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          timezone: value,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update timezone");

      setSelectedTimezone(value);
      toast.success(`Timezone updated to ${value || "UTC"}`);
      await fetchSchedule();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update timezone",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFailureCallbackSave = async () => {
    if (!schedule) return;

    setSaving(true);
    try {
      const res = await fetch("/api/settings/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          failureCallback: failureCallback,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to update failure callback");

      toast.success("Failure callback updated");
      await fetchSchedule();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update failure callback",
      );
    } finally {
      setSaving(false);
    }
  };

  const selectedOption = INTERVAL_OPTIONS.find(
    (o) => o.value === selectedInterval,
  );
  const isOverFreeLimit = selectedOption && selectedOption.dailyMessages > 1000;

  if (loading) {
    return (
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-neutral-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading schedule...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={fetchSchedule}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!schedule) {
    return (
      <Card className="bg-neutral-900/50 border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cron Schedule
          </CardTitle>
          <CardDescription>
            No QStash schedule found. Configure one in the Upstash console.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="bg-neutral-900/50 border-neutral-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Cron Schedule
        </CardTitle>
        <CardDescription>
          Configure how often monitors are checked via QStash
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Check Interval</Label>
          <Select
            value={selectedInterval}
            onValueChange={handleIntervalChange}
            disabled={saving}
          >
            <SelectTrigger className="w-full bg-neutral-800 border-neutral-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <span className="text-neutral-500 ml-2">
                    ({option.dailyMessages}/day)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isOverFreeLimit && (
            <p className="text-sm text-yellow-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Exceeds QStash free tier (1,000/day)
            </p>
          )}
        </div>

        {/* Retries */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-neutral-400" />
            Retries
          </Label>
          <Select
            value={selectedRetries}
            onValueChange={handleRetriesChange}
            disabled={saving}
          >
            <SelectTrigger className="w-full bg-neutral-800 border-neutral-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETRY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500">
            Number of retry attempts if the request fails
          </p>
        </div>

        {/* Timezone */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-neutral-400" />
            Schedule Timezone
          </Label>
          <Select
            value={selectedTimezone}
            onValueChange={handleTimezoneChange}
            disabled={saving}
          >
            <SelectTrigger className="w-full bg-neutral-800 border-neutral-700">
              <SelectValue placeholder="UTC (default)" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-neutral-500">
            Timezone for interpreting the cron schedule
          </p>
        </div>

        {/* Failure Callback */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-neutral-400" />
            Failure Callback URL
          </Label>
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://your-webhook.com/failure"
              value={failureCallback}
              onChange={(e) => setFailureCallback(e.target.value)}
              className="bg-neutral-800 border-neutral-700"
              disabled={saving}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleFailureCallbackSave}
              disabled={
                saving || failureCallback === (schedule.failureCallback || "")
              }
              className="shrink-0"
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            URL to call when all retries are exhausted. Use your app&apos;s
            built-in endpoint:
          </p>
          <code className="text-xs bg-neutral-800 px-2 py-1 rounded text-green-400 block overflow-x-auto">
            {typeof window !== "undefined"
              ? `${window.location.origin}/api/cron/failure-callback`
              : "/api/cron/failure-callback"}
          </code>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg">
          <div>
            <p className="text-sm font-medium">
              Status:{" "}
              {schedule.isPaused ? (
                <span className="text-yellow-400">Paused</span>
              ) : (
                <span className="text-green-400">Active</span>
              )}
            </p>
            <p className="text-xs text-neutral-500">Cron: {schedule.cron}</p>
          </div>
          <Button
            variant={schedule.isPaused ? "default" : "outline"}
            size="sm"
            onClick={handlePauseResume}
            disabled={saving}
          >
            {schedule.isPaused ? (
              <>
                <Play className="h-4 w-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-neutral-500">
          Daily messages: ~{selectedOption?.dailyMessages || 0} | Free tier:
          1,000/day
        </p>
      </CardContent>
    </Card>
  );
}
