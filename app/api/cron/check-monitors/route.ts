import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMonitorCheck } from "@/lib/monitor-checker";

// Vercel Cron Job to check all active monitors
// This endpoint should be called every minute by Vercel Cron
export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();

    // Get all active monitors that are due for a check
    const now = new Date();

    type Monitor = {
      id: string;
      user_id: string;
      name: string;
      type: "http" | "tcp" | "ping" | "keyword" | "dns" | "docker" | "steam";
      url: string | null;
      hostname: string | null;
      port: number | null;
      method: string | null;
      keyword: string | null;
      interval: number;
      timeout: number;
      max_retries: number;
      active: boolean;
    };

    const { data: monitors, error } = await supabase
      .from("monitors")
      .select("*")
      .eq("active", true);

    if (error) {
      console.error("Error fetching monitors:", error);
      return NextResponse.json(
        { error: "Failed to fetch monitors" },
        { status: 500 },
      );
    }

    if (!monitors || monitors.length === 0) {
      return NextResponse.json({
        message: "No active monitors to check",
        checked: 0,
      });
    }

    // For each monitor, check if it's time to run based on interval
    const monitorsToCheck: Monitor[] = [];

    for (const monitor of monitors as Monitor[]) {
      // Get the last heartbeat for this monitor
      const { data: lastHeartbeat } = await supabase
        .from("heartbeats")
        .select("time")
        .eq("monitor_id", monitor.id)
        .order("time", { ascending: false })
        .limit(1)
        .single();

      if (!lastHeartbeat) {
        // No previous check, run it now
        monitorsToCheck.push(monitor);
      } else {
        // Check if enough time has passed since last check
        const heartbeat = lastHeartbeat as unknown as { time: string };
        const lastCheckTime = new Date(heartbeat.time);
        const secondsSinceLastCheck =
          (now.getTime() - lastCheckTime.getTime()) / 1000;

        if (secondsSinceLastCheck >= monitor.interval) {
          monitorsToCheck.push(monitor);
        }
      }
    }

    console.log(
      `Checking ${monitorsToCheck.length} monitors out of ${monitors.length} total`,
    );

    // Process checks in parallel with concurrency limit
    const concurrencyLimit = 10;
    const results = [];

    for (let i = 0; i < monitorsToCheck.length; i += concurrencyLimit) {
      const batch = monitorsToCheck.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map((monitor) => processMonitorCheck(monitor)),
      );
      results.push(...batchResults);
    }

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`Completed: ${successful} successful, ${failed} failed`);

    return NextResponse.json({
      message: "Monitor checks completed",
      total: monitors.length,
      checked: monitorsToCheck.length,
      successful,
      failed,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

// Allow POST as well for manual triggering
export async function POST(request: NextRequest) {
  return GET(request);
}
