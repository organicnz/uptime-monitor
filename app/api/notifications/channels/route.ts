import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/api-utils/with-auth";
import {
  channelIdSchema,
  createChannel,
  createChannelSchema,
  deleteChannel,
  updateChannel,
  updateChannelSchema,
} from "@/lib/notification-channels";

/**
 * Notification channel CRUD.
 *
 * Credentials in `config` are split server-side and written to Supabase
 * Vault, so no response body and no browser bundle ever holds one. See
 * lib/notification-channels.ts.
 */

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

      const parsed = createChannelSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid request" },
          { status: 400 },
        );
      }

      const result = await createChannel(user.id, parsed.data);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }

      return NextResponse.json({ success: true, channel: result.channel });
    },
    { requireMfa: true },
  );
}

export async function PATCH(request: NextRequest) {
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

      const parsed = updateChannelSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid request" },
          { status: 400 },
        );
      }

      const result = await updateChannel(user.id, parsed.data);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }

      return NextResponse.json({ success: true, channel: result.channel });
    },
    { requireMfa: true },
  );
}

export async function GET(request: NextRequest) {
  return withAuth(async (supabase, user) => {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      const parsedId = channelIdSchema.safeParse(id);
      if (!parsedId.success) {
        return NextResponse.json(
          { error: "Valid channel ID required" },
          { status: 400 },
        );
      }

      // `has_secret` tells the UI whether a credential is stored without
      // revealing it, so the form can offer "replace" instead of "enter".
      const { data: view, error } = await supabase
        .from("notification_channels")
        .select("id, name, type, config, active, is_default, secret_id")
        .eq("id", parsedId.data)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching channel:", error);
        return NextResponse.json(
          { error: "Failed to fetch notification channel" },
          { status: 500 },
        );
      }

      if (!view) {
        return NextResponse.json(
          { error: "Channel not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({
        channel: {
          id: view.id,
          name: view.name,
          type: view.type,
          config: view.config,
          active: view.active,
          is_default: view.is_default,
          has_secret: (view.secret_id as string | null) !== null,
        },
      });
    }

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
    async (_supabase, user) => {
      const { searchParams } = new URL(request.url);
      const parsedId = channelIdSchema.safeParse(searchParams.get("id"));

      if (!parsedId.success) {
        return NextResponse.json(
          { error: "Valid channel ID required" },
          { status: 400 },
        );
      }

      const result = await deleteChannel(user.id, parsedId.data);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status },
        );
      }

      return NextResponse.json({ success: true });
    },
    { requireMfa: true },
  );
}
