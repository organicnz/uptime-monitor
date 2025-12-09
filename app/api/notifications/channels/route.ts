import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const { name, type, config } = body;

    if (!name || !type || !config) {
      return NextResponse.json(
        { error: "Name, type, and config are required" },
        { status: 400 },
      );
    }

    const validTypes = [
      "email",
      "discord",
      "slack",
      "webhook",
      "telegram",
      "pushover",
      "teams",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 },
      );
    }

    type ChannelInsert = {
      user_id: string;
      name: string;
      type: string;
      config: Record<string, unknown>;
      active: boolean;
    };
    const insertData: ChannelInsert = {
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
  } catch (error) {
    console.error("Create channel error:", error);
    return NextResponse.json(
      { error: "Failed to create notification channel" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  } catch (error) {
    console.error("Fetch channels error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notification channels" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Channel ID required" },
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
  } catch (error) {
    console.error("Delete channel error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification channel" },
      { status: 500 },
    );
  }
}
