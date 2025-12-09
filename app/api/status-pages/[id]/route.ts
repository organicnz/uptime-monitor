import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// UUID validation regex
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input validation schema
const updateStatusPageSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be less than 100 characters")
    .trim(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50, "Slug must be less than 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens",
    ),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters")
    .optional()
    .nullable(),
  is_public: z.boolean().optional(),
  monitor_ids: z.array(z.string().uuid()).optional().default([]),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Validate ID format
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid status page ID" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate input
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validationResult = updateStatusPageSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 },
      );
    }

    const { title, slug, description, is_public, monitor_ids } =
      validationResult.data;

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

    // Validate ID format
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: "Invalid status page ID" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
