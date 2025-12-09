import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { createServiceClient } from "@/lib/supabase/service";

// QStash receiver for signature verification
const qstashReceiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || "",
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || "",
});

// Verify QStash signature
async function verifyQStashSignature(request: NextRequest): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;

  try {
    const body = await request.text();
    return await qstashReceiver.verify({ signature, body });
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const requestId = `failure_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Verify the request is from QStash
    const isValid = await verifyQStashSignature(request);
    if (!isValid) {
      // Unauthorized request - silently reject
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse failure details from headers
    const failedUrl = request.headers.get("upstash-failed-url") || "unknown";
    const failedStatus =
      request.headers.get("upstash-failed-status") || "unknown";
    const failedMessage = request.headers.get("upstash-failed-message") || "";
    const messageId = request.headers.get("upstash-message-id") || "";
    const retried = request.headers.get("upstash-retried") || "0";

    console.error(`[${requestId}] QStash failure callback received:`, {
      failedUrl,
      failedStatus,
      failedMessage,
      messageId,
      retried,
    });

    // Log to database for tracking
    const supabase = createServiceClient();

    // You could create an incidents table entry or a dedicated cron_failures table
    // For now, we'll just log it. You can extend this to:
    // 1. Create an incident
    // 2. Send a notification
    // 3. Store in a failures log table

    // Example: Create an incident for the failure
    // This assumes you want to track cron failures as incidents
    const { error: insertError } = await supabase.from("incidents").insert({
      title: `Cron Job Failure`,
      content: `Monitor check cron job failed after ${retried} retries.\n\nURL: ${failedUrl}\nStatus: ${failedStatus}\nMessage: ${failedMessage}\nMessage ID: ${messageId}`,
      status: 0, // OPEN
      started_at: new Date().toISOString(),
    } as never);

    if (insertError) {
      console.error(`[${requestId}] Failed to log incident:`, insertError);
    }

    return NextResponse.json({
      success: true,
      message: "Failure logged",
      requestId,
    });
  } catch (error) {
    console.error(`[${requestId}] Error processing failure callback:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        requestId,
      },
      { status: 500 },
    );
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    endpoint: "failure-callback",
    timestamp: new Date().toISOString(),
  });
}
