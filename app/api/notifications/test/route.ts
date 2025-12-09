import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendNotification,
  NotificationType,
  NotificationConfig,
  NotificationPayload,
} from "@/lib/notifications";

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
    const { type, config, channelId } = body as {
      type?: NotificationType;
      config?: NotificationConfig;
      channelId?: string;
    };

    // Either test with provided config or fetch existing channel
    let notificationType: NotificationType;
    let notificationConfig: NotificationConfig;

    if (channelId) {
      // Test existing channel
      type ChannelRow = {
        id: string;
        user_id: string;
        type: NotificationType;
        config: NotificationConfig;
      };
      const { data: channelData, error } = await supabase
        .from("notification_channels")
        .select("*")
        .eq("id", channelId)
        .eq("user_id", user.id)
        .single();

      const channel = channelData as ChannelRow | null;

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
  } catch (error) {
    console.error("Test notification error:", error);
    return NextResponse.json(
      { error: "Failed to send test notification" },
      { status: 500 },
    );
  }
}
