import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/api-utils/with-auth";

// UUID validation regex
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Input validation schema for updating a status page
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
    .nullable(),
  is_public: z.boolean(),
  monitor_ids: z.array(z.string().uuid()),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    async (supabase) => {
      const { id } = await params;

      // Validate ID format
      if (!uuidRegex.test(id)) {
        return NextResponse.json(
          { error: "Invalid status page ID" },
          { status: 400 },
        );
      }

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

      const validationResult = updateStatusPageSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: validationResult.error.issues[0].message },
          { status: 400 },
        );
      }

      const { title, slug, description, is_public, monitor_ids } =
        validationResult.data;

      const { error: pageError } = await supabase.rpc(
        "update_status_page_with_monitors",
        {
          p_status_page_id: id,
          p_title: title,
          p_slug: slug,
          p_description: description,
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
          const notFound = pageError.message.includes("not found");
          return NextResponse.json(
            { error: notFound ? "Status page not found" : pageError.message },
            { status: notFound ? 404 : 400 },
          );
        }
        throw pageError;
      }

      return NextResponse.json({ success: true });
    },
    { requireMfa: true },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    async (supabase, user) => {
      const { id } = await params;

      // Validate ID format
      if (!uuidRegex.test(id)) {
        return NextResponse.json(
          { error: "Invalid status page ID" },
          { status: 400 },
        );
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
    },
    { requireMfa: true },
  );
}
