import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const schedules = await listSchedules();

    // Find the monitor check schedule
    const monitorSchedule = schedules.find((s) =>
      s.destination.includes("/api/cron/check-monitors"),
    );

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

    const body = await request.json();
    const { intervalMinutes } = body;

    if (!intervalMinutes || intervalMinutes < 1) {
      return NextResponse.json(
        { error: "Invalid interval. Minimum is 1 minute." },
        { status: 400 },
      );
    }

    // Get the site URL for the destination
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;
    if (!siteUrl) {
      return NextResponse.json(
        { error: "Site URL not configured" },
        { status: 500 },
      );
    }

    const destination = siteUrl.startsWith("http")
      ? `${siteUrl}/api/cron/check-monitors`
      : `https://${siteUrl}/api/cron/check-monitors`;

    const cron = intervalToCron(intervalMinutes);
    const result = await createSchedule({ destination, cron });

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

    const body = await request.json();
    const {
      scheduleId,
      intervalMinutes,
      action,
      retries,
      failureCallback,
      timezone,
    } = body;

    if (!scheduleId) {
      return NextResponse.json(
        { error: "Schedule ID is required" },
        { status: 400 },
      );
    }

    // Handle pause/resume
    if (action === "pause") {
      await pauseSchedule(scheduleId);
      return NextResponse.json({ success: true, action: "paused" });
    }

    if (action === "resume") {
      await resumeSchedule(scheduleId);
      return NextResponse.json({ success: true, action: "resumed" });
    }

    // Build update config
    const updateConfig: {
      cron?: string;
      retries?: number;
      failureCallback?: string;
    } = {};

    // Get current schedule to preserve existing values
    const schedules = await listSchedules();
    const currentSchedule = schedules.find((s) => s.scheduleId === scheduleId);

    // Handle interval and/or timezone changes - both affect the cron string
    if (intervalMinutes !== undefined || timezone !== undefined) {
      if (intervalMinutes !== undefined && intervalMinutes < 1) {
        return NextResponse.json(
          { error: "Invalid interval. Minimum is 1 minute." },
          { status: 400 },
        );
      }

      // Use new values or fall back to current
      const newInterval =
        intervalMinutes ??
        (currentSchedule ? cronToInterval(currentSchedule.cron) : 1);
      const newTimezone =
        timezone ??
        (currentSchedule ? cronToTimezone(currentSchedule.cron) : "UTC");

      updateConfig.cron = intervalToCron(newInterval, newTimezone);
    }

    if (retries !== undefined) {
      if (retries < 0 || retries > 5) {
        return NextResponse.json(
          { error: "Retries must be between 0 and 5." },
          { status: 400 },
        );
      }
      updateConfig.retries = retries;
    }

    if (failureCallback !== undefined) {
      updateConfig.failureCallback = failureCallback || undefined;
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
      intervalMinutes: updateConfig.cron ? intervalMinutes : undefined,
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
