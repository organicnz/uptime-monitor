import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listSchedules,
  updateScheduleCron,
  pauseSchedule,
  resumeSchedule,
  intervalToCron,
  cronToInterval,
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
    const { scheduleId, intervalMinutes, action } = body;

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

    // Handle interval update
    if (intervalMinutes) {
      if (intervalMinutes < 1) {
        return NextResponse.json(
          { error: "Invalid interval. Minimum is 1 minute." },
          { status: 400 },
        );
      }

      const cron = intervalToCron(intervalMinutes);
      const result = await updateScheduleCron(scheduleId, cron);

      return NextResponse.json({
        success: true,
        newScheduleId: result.scheduleId,
        cron,
        intervalMinutes,
      });
    }

    return NextResponse.json(
      { error: "No valid action or interval provided" },
      { status: 400 },
    );
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
