import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils/with-auth";
import { notificationTypes } from "@/lib/notification-types";
import {
  channelIdSchema,
  resolveChannelConfigs,
} from "@/lib/notification-channels";
import { createServiceClient } from "@/lib/supabase/service";
import { sendNotification, type NotificationType } from "@/lib/notifications";
import { getNotificationDispatchSecret, getSupabaseEnv } from "@/lib/env";

import type { NotificationConfig } from "@/lib/notification-types";

export const runtime = "nodejs";

/**
 * Sends a test notification.
 *
 * Two transports, same senders (supabase/functions/_shared/senders.ts):
 * - `channelId` for a saved channel: dispatched by the `notification-dispatch`
 *   Edge Function when it is configured, so the credential is read from Vault
 *   inside the function and never enters this runtime.
 * - `type` + `config` for an unsaved channel: sent in-process, because there is
 *   nothing stored yet.
 */

const TEST_PAYLOAD = {
  title: "Test Notification",
  message: "This is a test notification from your Uptime Monitor.",
  status: "up" as const,
};

function testPayload() {
  return { ...TEST_PAYLOAD, timestamp: new Date().toISOString() };
}

type EdgeDispatch = { ok: true } | { ok: false; error: string };

/**
 * Invokes the Edge Function using a shared secret from the function's own
 * secret store. A missing secret is a hard configuration error, never a
 * silent fallback: the caller decides whether to fall back.
 */
async function dispatchViaEdgeFunction(
  channelId: string,
): Promise<EdgeDispatch | null> {
  const supabaseEnv = getSupabaseEnv();
  const secret = getNotificationDispatchSecret();

  if (!secret) {
    console.warn(
      "[notifications/test] NOTIFICATION_DISPATCH_SECRET unset; " +
        "edge dispatch is disabled",
    );
    return null;
  }

  const response = await fetch(
    `${supabaseEnv.url}/functions/v1/notification-dispatch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": secret,
      },
      body: JSON.stringify({ channel_id: channelId, payload: testPayload() }),
    },
  );

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;

  if (!response.ok || !body?.success) {
    return {
      ok: false,
      error: body?.error || `Edge dispatch failed: ${response.status}`,
    };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  return withAuth(
    async (_supabase, user) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }

      const { type, config, channelId } = body as {
        type?: NotificationType;
        config?: Record<string, unknown>;
        channelId?: string;
      };

      if (type && !notificationTypes.includes(type)) {
        return NextResponse.json(
          { error: "Invalid notification type" },
          { status: 400 },
        );
      }

      if (!channelId && !type) {
        return NextResponse.json(
          { error: "Either channelId or type+config required" },
          { status: 400 },
        );
      }

      if (channelId) {
        const parsedId = channelIdSchema.safeParse(channelId);
        if (!parsedId.success) {
          return NextResponse.json(
            { error: "Invalid channel ID" },
            { status: 400 },
          );
        }

        const supabase = createServiceClient();
        const { data: row, error } = await supabase
          .from("notification_channels")
          .select("id, type, config, secret_id")
          .eq("id", parsedId.data)
          .eq("user_id", user.id)
          .maybeSingle();

        if (error || !row) {
          return NextResponse.json(
            { error: "Channel not found" },
            { status: 404 },
          );
        }

        if ((row.secret_id as string | null) === null) {
          return NextResponse.json(
            { error: "Channel has no stored credentials" },
            { status: 400 },
          );
        }

        const edge = await dispatchViaEdgeFunction(parsedId.data).catch(
          (caught: unknown) => ({
            ok: false as const,
            error:
              caught instanceof Error ? caught.message : "Edge dispatch failed",
          }),
        );

        if (edge?.ok) {
          return NextResponse.json({
            success: true,
            message: "Test notification sent!",
            transport: "edge",
          });
        }

        if (edge) {
          return NextResponse.json(
            { success: false, error: edge.error },
            { status: 502 },
          );
        }

        const configs = await resolveChannelConfigs([
          {
            id: row.id as string,
            type: row.type as NotificationType,
            config: row.config as Record<string, unknown>,
          },
        ]);
        const resolved = configs.get(row.id as string);

        if (!resolved) {
          return NextResponse.json(
            { error: "Failed to read stored credentials" },
            { status: 500 },
          );
        }

        const result = await sendNotification(
          row.type as NotificationType,
          resolved as NotificationConfig,
          testPayload(),
        );

        return result.success
          ? NextResponse.json({
              success: true,
              message: "Test notification sent!",
              transport: "in-process",
            })
          : NextResponse.json(
              { success: false, error: result.error },
              { status: 400 },
            );
      }

      if (!config || typeof config !== "object") {
        return NextResponse.json(
          { error: "Either channelId or type+config required" },
          { status: 400 },
        );
      }

      const result = await sendNotification(
        type as NotificationType,
        config as unknown as NotificationConfig,
        testPayload(),
      );

      return result.success
        ? NextResponse.json({
            success: true,
            message: "Test notification sent!",
            transport: "in-process",
          })
        : NextResponse.json(
            { success: false, error: result.error },
            { status: 400 },
          );
    },
    { requireMfa: true },
  );
}
