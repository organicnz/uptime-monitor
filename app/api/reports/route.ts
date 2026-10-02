import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-utils/with-auth";
import {
  generateBulkUptimeReport,
  generateUptimeReport,
} from "@/lib/uptime-reports";

export const runtime = "nodejs";

const bulkSchema = z.object({
  monitorIds: z.array(z.string().uuid()).min(1).max(50),
  period: z.enum(["24h", "7d", "30d", "90d"]).default("24h"),
});

const singleSchema = z.object({
  monitorId: z.string().uuid(),
  period: z.enum(["24h", "7d", "30d", "90d"]).default("24h"),
});

/**
 * Uptime reports over a rolling window.
 *
 * Reads run through the RLS-scoped user client, so ownership is enforced by
 * the database rather than by a hand-rolled user_id comparison that could
 * drift from the policies. MFA is required to match every other dashboard API.
 */
export async function GET(request: NextRequest) {
  return withAuth(
    async (supabase, user) => {
      const url = new URL(request.url);
      const parsed = singleSchema.safeParse({
        monitorId: url.searchParams.get("monitorId"),
        period: url.searchParams.get("period") ?? undefined,
      });

      if (!parsed.success) {
        return NextResponse.json(
          { error: "monitorId (uuid) and period are required" },
          { status: 400 },
        );
      }

      const report = await generateUptimeReport(
        supabase,
        parsed.data.monitorId,
        parsed.data.period,
      ).catch((error: unknown) => {
        console.error("[reports] GET failed:", error);
        return null;
      });

      if (!report) {
        return NextResponse.json(
          { error: "Monitor not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ ...report, userId: user.id });
    },
    { requireMfa: true },
  );
}

export async function POST(request: NextRequest) {
  return withAuth(
    async (supabase) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const parsed = bulkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid request" },
          { status: 400 },
        );
      }

      try {
        const reports = await generateBulkUptimeReport(
          supabase,
          parsed.data.monitorIds,
          parsed.data.period,
        );
        return NextResponse.json({ reports, period: parsed.data.period });
      } catch (error) {
        console.error("[reports] POST failed:", error);
        return NextResponse.json(
          { error: "Failed to generate reports" },
          { status: 500 },
        );
      }
    },
    { requireMfa: true },
  );
}
