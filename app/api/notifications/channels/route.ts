import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-utils/with-auth";

import { notificationTypes } from "@/lib/notification-types";

// Config schemas for each notification type
const telegramConfigSchema = z.object({
  bot_token: z.string().min(1, "Bot token is required"),
  chat_id: z.string().min(1, "Chat ID is required"),
});

const webhookConfigSchema = z.object({
  url: z.string().url("Invalid webhook URL"),
  method: z.enum(["GET", "POST"]).optional().default("POST"),
  headers: z.record(z.string(), z.string()).optional(),
});

const discordSlackTeamsConfigSchema = z.object({
  webhook_url: z.string().url("Invalid webhook URL"),
});

const pushoverConfigSchema = z.object({
  user_key: z.string().min(1, "User key is required"),
  token: z.string().min(1, "API token is required"),
  priority: z.number().min(-2).max(2).optional(),
  sound: z.string().optional(),
});

const emailConfigSchema = z.object({
  smtp_host: z.string().min(1, "SMTP host is required"),
  smtp_port: z
    .number()
    .min(1)
    .max(65535, "SMTP port must be between 1 and 65535"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  to: z.string().email("Invalid email address"),
});

// Validate config based on type
function validateConfig(
  type: (typeof notificationTypes)[number],
  config: Record<string, unknown>,
) {
  switch (type) {
    case "telegram":
      return telegramConfigSchema.safeParse(config);
    case "discord":
    case "slack":
    case "teams":
      return discordSlackTeamsConfigSchema.safeParse(config);
    case "webhook":
      return webhookConfigSchema.safeParse(config);
    case "pushover":
      return pushoverConfigSchema.safeParse(config);
    case "email":
      return emailConfigSchema.safeParse(config);
    default:
      return {
        success: false,
        error: { issues: [{ message: "Invalid type" }] },
      };
  }
}

const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  type: z.enum(notificationTypes),
  config: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  return withAuth(
    async (supabase, user) => {
      // Parse and validate input
      let body;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: "Invalid JSON body" },
          { status: 400 },
        );
      }

      const validationResult = createChannelSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: validationResult.error.issues[0].message },
          { status: 400 },
        );
      }

      const { name, type, config } = validationResult.data;

      // Validate config based on type
      const configValidation = validateConfig(type, config);
      if (!configValidation.success) {
        const errorMessage =
          "error" in configValidation &&
          "issues" in configValidation.error &&
          Array.isArray(configValidation.error.issues) &&
          configValidation.error.issues.length > 0 &&
          configValidation.error.issues[0]?.message
            ? configValidation.error.issues[0].message
            : "Invalid configuration";
        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }

      const insertData = {
        user_id: user.id,
        name,
        type,
        config,
        active: true,
      };

      const { data, error } = await supabase
        .from("notification_channels")
        .insert(insertData as never)
        .select()
        .single();

      if (error) {
        console.error("Error creating channel:", error);
        return NextResponse.json(
          { error: "Failed to create notification channel" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, channel: data });
    },
    { requireMfa: true },
  );
}

export async function GET() {
  return withAuth(async (supabase, user) => {
    const { data: channels, error } = await supabase
      .from("notification_channels")
      .select("id, name, type, active, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching channels:", error);
      return NextResponse.json(
        { error: "Failed to fetch notification channels" },
        { status: 500 },
      );
    }

    return NextResponse.json({ channels: channels || [] });
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(
    async (supabase, user) => {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get("id");

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!id || !uuidRegex.test(id)) {
        return NextResponse.json(
          { error: "Valid channel ID required" },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("notification_channels")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error deleting channel:", error);
        return NextResponse.json(
          { error: "Failed to delete notification channel" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    },
    { requireMfa: true },
  );
}
