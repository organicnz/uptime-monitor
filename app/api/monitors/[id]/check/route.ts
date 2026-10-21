import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runMonitorCheck } from "@/lib/monitor-checker-runner";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const CheckRequestSchema = z.object({
  force: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = CheckRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const serviceClient = createServiceClient();

  const { data: monitorData, error: monitorError } = await serviceClient
    .from("monitors")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (monitorError || !monitorData) {
    return NextResponse.json({ error: "Monitor not found" }, { status: 404 });
  }

  const monitor = monitorData;

  if (!monitor.active && !parsed.data.force) {
    return NextResponse.json(
      { error: "Monitor is inactive. Use force=true to check anyway." },
      { status: 400 },
    );
  }

  try {
    await runMonitorCheck(monitor, undefined, {
      triggeredBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: "Check completed",
      monitorId: id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Check failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
