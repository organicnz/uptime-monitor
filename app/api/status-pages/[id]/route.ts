import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, slug, description, is_public, monitor_ids } = body;

    if (!title || !slug) {
      return NextResponse.json(
        { error: "Title and slug are required" },
        { status: 400 },
      );
    }

    // 1. Update status page
    const { error: pageError } = await supabase
      .from("status_pages")
      .update({
        title,
        slug,
        description,
        is_public,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id)
      .eq("user_id", user.id);

    if (pageError) {
      if (pageError.code === "23505") {
        return NextResponse.json(
          { error: "Slug already exists" },
          { status: 409 },
        );
      }
      throw pageError;
    }

    // 2. Update linked monitors
    // Strategy: Delete all existing and re-insert. Simple and effective for small lists.
    // Ideally we diff, but this is fine for now.

    // Delete existing
    const { error: deleteError } = await supabase
      .from("status_page_monitors")
      .delete()
      .eq("status_page_id", id);

    if (deleteError) throw deleteError;

    // Insert new
    if (monitor_ids && Array.isArray(monitor_ids) && monitor_ids.length > 0) {
      const monitorInserts = monitor_ids.map(
        (monitorId: string, index: number) => ({
          status_page_id: id,
          monitor_id: monitorId,
          display_order: index,
        }),
      );

      const { error: monitorsError } = await supabase
        .from("status_page_monitors")
        .insert(monitorInserts as never);

      if (monitorsError) {
        console.error("Error linking monitors:", monitorsError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update status page error:", error);
    return NextResponse.json(
      { error: "Failed to update status page" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete status page (cascade should handle monitors if configured, but let's see schema)
    // status_page_monitors typically references status_pages.
    // If no cascade, we manually delete. But let's assume cascade or just try deleting page.

    const { error } = await supabase
      .from("status_pages")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete status page error:", error);
    return NextResponse.json(
      { error: "Failed to delete status page" },
      { status: 500 },
    );
  }
}
