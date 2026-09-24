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
    const retried = Number.parseInt(
      request.headers.get("upstash-retried") || "0",
      10,
    );
    const retryCount = Number.isFinite(retried) ? Math.max(0, retried) : 0;
    const failureKey =
      messageId || `${failedUrl}:${failedStatus}:${retryCount}`;

    console.error(`[${requestId}] QStash failure callback received:`, {
      failedUrl,
      failedStatus,
      failedMessage,
      messageId,
      retried: retryCount,
    });

    const supabase = createServiceClient();
    const { error: insertError } = await supabase.from("cron_failures").upsert(
      {
        message_id: failureKey,
        failed_url: failedUrl,
        failed_status: failedStatus,
        failed_message: failedMessage.slice(0, 4000),
        retried: retryCount,
      },
      { onConflict: "message_id" },
    );

    if (insertError) {
      console.error(`[${requestId}] Failed to log cron failure:`, insertError);
      return NextResponse.json(
        { error: "Failed to log cron failure", requestId },
        { status: 500 },
      );
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
