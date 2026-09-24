import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils/with-auth";
import { notificationTypes } from "@/lib/notification-types";
import {
  sendNotification,
  type NotificationType,
  type NotificationConfig,
  type NotificationPayload,
} from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withAuth(
    async (supabase, user) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      if (!body || typeof body !== "object") {
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }

      const { type, config, channelId } = body as {
        type?: NotificationType;
        config?: NotificationConfig;
        channelId?: string;
      };

      if (
        channelId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          channelId,
        )
      ) {
        return NextResponse.json(
          { error: "Invalid channel ID" },
          { status: 400 },
        );
      }

      if (type && !notificationTypes.includes(type)) {
        return NextResponse.json(
          { error: "Invalid notification type" },
          { status: 400 },
        );
      }

      if (
        !channelId &&
        (!type ||
          !config ||
          typeof config !== "object" ||
          Array.isArray(config))
      ) {
        return NextResponse.json(
          { error: "Either channelId or type+config required" },
          { status: 400 },
        );
      }

      // Either test with provided config or fetch existing channel
      let notificationType: NotificationType;
      let notificationConfig: NotificationConfig;

      if (channelId) {
        // Test existing channel
        const { data: channelData, error } = await supabase
          .from("notification_channels")
          .select("*")
          .eq("id", channelId)
          .eq("user_id", user.id)
          .single();

        const channel = channelData as {
          id: string;
          type: NotificationType;
          config: NotificationConfig;
        } | null;

        if (error || !channel) {
          return NextResponse.json(
            { error: "Channel not found" },
            { status: 404 },
          );
        }

        notificationType = channel.type;
        notificationConfig = channel.config;
      } else if (type && config) {
        // Test with provided config
        notificationType = type;
        notificationConfig = config;
      } else {
        return NextResponse.json(
          { error: "Either channelId or type+config required" },
          { status: 400 },
        );
      }

      const testPayload: NotificationPayload = {
        title: "Test Notification",
        message: "This is a test notification from your Uptime Monitor.",
        status: "up",
        timestamp: new Date().toISOString(),
      };

      const result = await sendNotification(
        notificationType,
        notificationConfig,
        testPayload,
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "Test notification sent!",
        });
      } else {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 },
        );
      }
    },
    { requireMfa: true },
  );
}
