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
    const { title, slug, description, is_public, monitor_ids } = body;

    if (!title || !slug) {
      return NextResponse.json(
        { error: "Title and slug are required" },
        { status: 400 },
      );
    }

    // specific slug validation could go here
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Define type locally
    interface StatusPage {
      id: string;
    }

    // 1. Create status page
    const { data: statusPage, error: pageError } = await supabase
      .from("status_pages")
      .insert({
        user_id: user.id,
        title,
        slug: cleanSlug,
        description,
        is_public: is_public ?? true,
      } as never)
      .select("id")
      .single();

    if (pageError) {
      if (pageError.code === "23505") {
        return NextResponse.json(
          { error: "Slug already exists" },
          { status: 409 },
        );
      }
      throw pageError;
    }

    const typedStatusPage = statusPage as unknown as StatusPage;

    // 2. Link monitors if provided
    if (monitor_ids && Array.isArray(monitor_ids) && monitor_ids.length > 0) {
      const monitorInserts = monitor_ids.map(
        (monitorId: string, index: number) => ({
          status_page_id: typedStatusPage.id,
          monitor_id: monitorId,
          display_order: index,
        }),
      );

      const { error: monitorsError } = await supabase
        .from("status_page_monitors")
        .insert(monitorInserts as never);

      if (monitorsError) {
        // Log error but don't fail the whole request since page is created
        console.error("Error linking monitors:", monitorsError);
      }
    }

    return NextResponse.json({ success: true, statusPage });
  } catch (error) {
    console.error("Create status page error:", error);
    return NextResponse.json(
      { error: "Failed to create status page" },
      { status: 500 },
    );
  }
}
