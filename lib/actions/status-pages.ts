"use server";

import { createClient } from "@/lib/supabase/server";
import { getMfaVerificationError } from "@/lib/mfa";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

// Schema for validation
const StatusPageSchema = z.object({
  title: z.string().min(1, "Title is required").max(100).trim(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must contain only lowercase letters, numbers, and hyphens",
    ),
  description: z.string().max(500).optional().nullable(),
  is_public: z.boolean().default(true),
  monitor_ids: z.array(z.string().uuid()).optional(),
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

  const mfaError = await getMfaVerificationError(supabase);
  if (mfaError) {
    return { error: mfaError };
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

  const { error: pageError } = await supabase.rpc(
    "create_status_page_with_monitors",
    {
      p_title: title,
      p_slug: slug,
      p_description: description ?? null,
      p_is_public: is_public ?? true,
      p_monitor_ids: monitor_ids || [],
    },
  );

  if (pageError) {
    if (pageError.code === "23505") {
      return { error: "Slug already exists. Please choose a unique URL." };
    }
    if (pageError.code === "P0001") {
      return { error: pageError.message };
    }
    console.error("Failed to create status page:", pageError);
    return { error: "Failed to create status page. Please try again." };
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

  const mfaError = await getMfaVerificationError(supabase);
  if (mfaError) {
    return { error: mfaError };
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

  const { error: pageError } = await supabase.rpc(
    "update_status_page_with_monitors",
    {
      p_status_page_id: id,
      p_title: title,
      p_slug: slug,
      p_description: description ?? null,
      p_is_public: is_public ?? true,
      p_monitor_ids: monitor_ids || [],
    },
  );

  if (pageError) {
    if (pageError.code === "23505") {
      return { error: "Slug already exists. Please choose a unique URL." };
    }
    if (pageError.code === "P0001") {
      return {
        error: pageError.message.includes("not found")
          ? "Status page not found"
          : pageError.message,
      };
    }
    console.error("Failed to update status page:", pageError);
    return { error: "Failed to update status page. Please try again." };
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

  const mfaError = await getMfaVerificationError(supabase);
  if (mfaError) {
    throw new Error(mfaError);
  }

  const { error } = await supabase
    .from("status_pages")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to delete status page:", error);
    throw new Error("Failed to delete status page");
  }

  revalidatePath("/dashboard/status-pages");
  redirect("/dashboard/status-pages");
}
