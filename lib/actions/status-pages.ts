"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

// Schema for validation
const StatusPageSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional().nullable(),
  is_public: z.boolean().default(true),
  monitor_ids: z.array(z.string()).optional(),
});

export type State = {
  error?: string | null;
  success?: boolean;
};

export async function createStatusPage(
  prevState: State | null,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Parse Checkboxes (monitor_ids)
  // In FormData, multiple entries with same key (monitor_ids) will exist.
  // We need to extract them.
  const monitorIds = formData.getAll("monitor_ids");

  const rawData = {
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    is_public: formData.get("is_public") === "on", // Switch usually sends "on" if checked, or nothing
    monitor_ids: monitorIds,
  };

  // Clean Slug
  if (typeof rawData.slug === "string") {
    rawData.slug = rawData.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  const validate = StatusPageSchema.safeParse(rawData);

  if (!validate.success) {
    return { error: validate.error.issues[0].message };
  }

  const { title, slug, description, is_public, monitor_ids } = validate.data;

  // 1. Create Status Page
  const { data: statusPage, error: pageError } = await supabase
    .from("status_pages")
    .insert({
      user_id: user.id,
      title,
      slug,
      description,
      is_public: is_public ?? true,
    } as never)
    .select("id")
    .single();

  if (pageError) {
    if (pageError.code === "23505") {
      return { error: "Slug already exists. Please choose a unique URL." };
    }
    return { error: pageError.message };
  }

  // 2. Link Monitors
  const pageId = (statusPage as { id: string }).id;

  if (monitor_ids && monitor_ids.length > 0) {
    const monitorInserts = monitor_ids.map((id, index) => ({
      status_page_id: pageId,
      monitor_id: id,
      display_order: index,
    }));

    const { error: monitorsError } = await supabase
      .from("status_page_monitors")
      .insert(monitorInserts as never);

    if (monitorsError) {
      console.error("Failed to link monitors:", monitorsError);
      // We don't fail the whole action, but logging is important
    }
  }

  revalidatePath("/dashboard/status-pages");
  redirect("/dashboard/status-pages");
}

export async function updateStatusPage(
  id: string,
  prevState: State | null,
  formData: FormData,
): Promise<State> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  // Parse logic same as create
  const monitorIds = formData.getAll("monitor_ids");
  const rawData = {
    title: formData.get("title"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    is_public: formData.get("is_public") === "on",
    monitor_ids: monitorIds,
  };

  // Clean Slug
  if (typeof rawData.slug === "string") {
    rawData.slug = rawData.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  const validate = StatusPageSchema.safeParse(rawData);
  if (!validate.success) {
    return { error: validate.error.issues[0].message };
  }

  const { title, slug, description, is_public, monitor_ids } = validate.data;

  // 1. Update Status Page
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
      return { error: "Slug already exists. Please choose a unique URL." };
    }
    return { error: pageError.message };
  }

  // 2. Relink Monitors (Delete all -> Add all)
  // Delete existing
  const { error: deleteError } = await supabase
    .from("status_page_monitors")
    .delete()
    .eq("status_page_id", id);

  if (deleteError) {
    return { error: "Failed to update monitors (delete step)" };
  }

  // Insert new
  if (monitor_ids && monitor_ids.length > 0) {
    const monitorInserts = monitor_ids.map((monId, index) => ({
      status_page_id: id,
      monitor_id: monId,
      display_order: index,
    }));

    const { error: monitorsError } = await supabase
      .from("status_page_monitors")
      .insert(monitorInserts as never);

    if (monitorsError) {
      return { error: "Failed to update monitors (insert step)" };
    }
  }

  revalidatePath("/dashboard/status-pages");
  revalidatePath(`/dashboard/status-pages/${id}`);
  redirect("/dashboard/status-pages");
}

export async function deleteStatusPage(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("status_pages")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard/status-pages");
  redirect("/dashboard/status-pages");
}
