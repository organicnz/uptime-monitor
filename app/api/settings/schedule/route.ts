import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMfaVerificationError } from "@/lib/mfa";
import type { User } from "@supabase/supabase-js";
import {
  listSchedules,
  updateSchedule,
  pauseSchedule,
  resumeSchedule,
  intervalToCron,
  cronToInterval,
  cronToTimezone,
  createSchedule,
} from "@/lib/qstash";

const MONITOR_SCHEDULE_SUFFIX = "/api/cron/check-monitors";

function getSiteUrl(): string | null {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  return configured?.replace(/\/+$/, "") || null;
}

function isScheduleAdmin(user: User): boolean {
  const configuredIds = (process.env.ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return user.app_metadata?.role === "admin" || configuredIds.includes(user.id);
}

function findMonitorSchedule(
  schedules: Awaited<ReturnType<typeof listSchedules>>,
) {
  return schedules.find((schedule) =>
    schedule.destination.includes(MONITOR_SCHEDULE_SUFFIX),
  );
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

// GET - List schedules and find the monitor check schedule
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isScheduleAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const schedules = await listSchedules();

    // Find the monitor check schedule
    const monitorSchedule = findMonitorSchedule(schedules);

    if (!monitorSchedule) {
      return NextResponse.json({
        schedule: null,
        message: "No monitor check schedule found",
      });
    }

    return NextResponse.json({
      schedule: {
        id: monitorSchedule.scheduleId,
        cron: monitorSchedule.cron,
        intervalMinutes: cronToInterval(monitorSchedule.cron),
        destination: monitorSchedule.destination,
        isPaused: monitorSchedule.isPaused,
        createdAt: monitorSchedule.createdAt,
        retries: monitorSchedule.retries,
        failureCallback: monitorSchedule.failureCallback,
        timezone: cronToTimezone(monitorSchedule.cron),
      },
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch schedule",
      },
      { status: 500 },
    );
  }
}

// POST - Create schedule if none exists
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isScheduleAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const mfaError = await getMfaVerificationError(supabase);
    if (mfaError) {
      return NextResponse.json({ error: mfaError }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const intervalMinutes = Number(
      body && typeof body === "object" && "intervalMinutes" in body
        ? body.intervalMinutes
        : NaN,
    );
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < 1 ||
      intervalMinutes > 1440
    ) {
      return NextResponse.json(
        { error: "Interval must be a whole number between 1 and 1440 minutes" },
        { status: 400 },
      );
    }

    const schedules = await listSchedules();
    if (findMonitorSchedule(schedules)) {
      return NextResponse.json(
        { error: "Monitor check schedule already exists" },
        { status: 409 },
      );
    }

    const siteUrl = getSiteUrl();
    if (!siteUrl) {
      return NextResponse.json(
        { error: "Site URL not configured" },
        { status: 500 },
      );
    }

    const destination = `${siteUrl}${MONITOR_SCHEDULE_SUFFIX}`;

    const cron = intervalToCron(intervalMinutes);
    const result = await createSchedule({
      destination,
      cron,
      failureCallback: `${siteUrl}/api/cron/failure-callback`,
    });

    return NextResponse.json({
      success: true,
      scheduleId: result.scheduleId,
      cron,
      intervalMinutes,
    });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create schedule",
      },
      { status: 500 },
    );
  }
}

// PATCH - Update schedule interval or pause/resume
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isScheduleAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const mfaError = await getMfaVerificationError(supabase);
    if (mfaError) {
      return NextResponse.json({ error: mfaError }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const {
      scheduleId,
      intervalMinutes,
      action,
      retries,
      failureCallback,
      timezone,
    } = body as {
      scheduleId?: string;
      intervalMinutes?: unknown;
      action?: string;
      retries?: unknown;
      failureCallback?: string;
      timezone?: string;
    };

    if (!scheduleId) {
      return NextResponse.json(
        { error: "Schedule ID is required" },
        { status: 400 },
      );
    }

    const schedules = await listSchedules();
    const currentSchedule = findMonitorSchedule(schedules);
    if (!currentSchedule || currentSchedule.scheduleId !== scheduleId) {
      return NextResponse.json(
        { error: "Monitor check schedule not found" },
        { status: 404 },
      );
    }

    if (action === "pause") {
      await pauseSchedule(currentSchedule.scheduleId);
      return NextResponse.json({ success: true, action: "paused" });
    }

    if (action === "resume") {
      await resumeSchedule(currentSchedule.scheduleId);
      return NextResponse.json({ success: true, action: "resumed" });
    }

    const updateConfig: {
      cron?: string;
      retries?: number;
      failureCallback?: string;
    } = {};

    if (action !== undefined && action !== "update") {
      return NextResponse.json(
        { error: "Invalid schedule action" },
        { status: 400 },
      );
    }

    const parsedInterval =
      intervalMinutes === undefined ? undefined : Number(intervalMinutes);
    if (
      parsedInterval !== undefined &&
      (!Number.isInteger(parsedInterval) ||
        parsedInterval < 1 ||
        parsedInterval > 1440)
    ) {
      return NextResponse.json(
        { error: "Interval must be a whole number between 1 and 1440 minutes" },
        { status: 400 },
      );
    }
    if (timezone !== undefined && !isValidTimezone(timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }

    if (parsedInterval !== undefined || timezone !== undefined) {
      const newInterval =
        parsedInterval ?? cronToInterval(currentSchedule.cron);
      const newTimezone = timezone ?? cronToTimezone(currentSchedule.cron);
      updateConfig.cron = intervalToCron(newInterval, newTimezone);
    }

    const parsedRetries = retries === undefined ? undefined : Number(retries);
    if (parsedRetries !== undefined) {
      if (
        !Number.isInteger(parsedRetries) ||
        parsedRetries < 0 ||
        parsedRetries > 5
      ) {
        return NextResponse.json(
          { error: "Retries must be between 0 and 5." },
          { status: 400 },
        );
      }
      updateConfig.retries = parsedRetries;
    }

    if (failureCallback !== undefined) {
      const siteUrl = getSiteUrl();
      if (!siteUrl) {
        return NextResponse.json(
          { error: "Site URL not configured" },
          { status: 500 },
        );
      }
      const expectedFailureCallback = `${siteUrl}/api/cron/failure-callback`;
      if (failureCallback && failureCallback !== expectedFailureCallback) {
        return NextResponse.json(
          { error: "Invalid failure callback" },
          { status: 400 },
        );
      }
      updateConfig.failureCallback = expectedFailureCallback;
    }

    // Check if we have anything to update
    if (Object.keys(updateConfig).length === 0) {
      return NextResponse.json(
        { error: "No valid update parameters provided" },
        { status: 400 },
      );
    }

    const result = await updateSchedule(scheduleId, updateConfig);

    return NextResponse.json({
      success: true,
      newScheduleId: result.scheduleId,
      ...updateConfig,
      intervalMinutes: updateConfig.cron ? parsedInterval : undefined,
    });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update schedule",
      },
      { status: 500 },
    );
  }
}
