import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-utils/with-auth";

// Input validation schema for creating a status page
const createStatusPageSchema = z.object({
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
  is_public: z.boolean().optional().default(true),
  monitor_ids: z.array(z.string().uuid()).optional().default([]),
});

export async function POST(request: NextRequest) {
  return withAuth(
    async (supabase) => {
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

      const validationResult = createStatusPageSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: validationResult.error.issues[0].message },
          { status: 400 },
        );
      }

      const { title, slug, description, is_public, monitor_ids } =
        validationResult.data;
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

      const { data: statusPageId, error: pageError } = await supabase.rpc(
        "create_status_page_with_monitors",
        {
          p_title: title,
          p_slug: cleanSlug,
          p_description: description ?? null,
          p_is_public: is_public,
          p_monitor_ids: monitor_ids,
        },
      );

      if (pageError) {
        if (pageError.code === "23505") {
          return NextResponse.json(
            { error: "Slug already exists" },
            { status: 409 },
          );
        }
        if (pageError.code === "P0001") {
          return NextResponse.json(
            { error: pageError.message },
            { status: 400 },
          );
        }
        throw pageError;
      }

      return NextResponse.json({
        success: true,
        statusPage: { id: statusPageId },
      });
    },
    { requireMfa: true },
  );
}

export async function GET() {
  return withAuth(async (supabase, user) => {
    const { data: channels, error } = await supabase
      .from("status_pages")
      .select("id, title, slug, is_public, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch status pages error:", error);
      return NextResponse.json(
        { error: "Failed to fetch status pages" },
        { status: 500 },
      );
    }

    return NextResponse.json({ statusPages: channels || [] });
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
          { error: "Valid status page ID required" },
          { status: 400 },
        );
      }

      const { error } = await supabase
        .from("status_pages")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Delete status page error:", error);
        return NextResponse.json(
          { error: "Failed to delete status page" },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true });
    },
    { requireMfa: true },
  );
}
