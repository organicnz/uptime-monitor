"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";

const groupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default("#6366f1"),
});

export type GroupFormState = {
  success: boolean;
  error?: string;
  id?: string;
};

export async function createGroup(formData: FormData): Promise<GroupFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rawData = {
    name: formData.get("name") as string,
    description: formData.get("description") as string,
    color: (formData.get("color") as string) || "#6366f1",
  };

  const parsed = groupSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid data",
    };
  }

  // Get next sort order
  const { data: existingGroups } = await supabase
    .from("monitor_groups")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSortOrder = existingGroups?.[0]
    ? (existingGroups[0] as { sort_order: number }).sort_order + 1
    : 0;

  const { data: group, error } = await supabase
    .from("monitor_groups")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
      sort_order: nextSortOrder,
    } as unknown as never)
    .select()
    .single();

  if (error || !group) {
    return {
      success: false,
      error: error?.message || "Failed to create group",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true, id: (group as { id: string }).id };
}

export async function updateGroup(
  id: string,
  formData: FormData,
): Promise<GroupFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rawData = {
    name: formData.get("name") as string,
    description: formData.get("description") as string,
    color: (formData.get("color") as string) || "#6366f1",
  };

  const parsed = groupSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid data",
    };
  }

  const { error } = await supabase
    .from("monitor_groups")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      color: parsed.data.color,
    } as unknown as never)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true };
}

export async function deleteGroup(id: string): Promise<GroupFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("monitor_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true };
}

export async function assignMonitorToGroup(
  monitorId: string,
  groupId: string | null,
): Promise<GroupFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify monitor ownership
  const { data: monitor } = await supabase
    .from("monitors")
    .select("id")
    .eq("id", monitorId)
    .eq("user_id", user.id)
    .single();

  if (!monitor) {
    return { success: false, error: "Monitor not found" };
  }

  // Verify group ownership if assigning to a group
  if (groupId) {
    const { data: group } = await supabase
      .from("monitor_groups")
      .select("id")
      .eq("id", groupId)
      .eq("user_id", user.id)
      .single();

    if (!group) {
      return { success: false, error: "Group not found" };
    }
  }

  const { error } = await supabase
    .from("monitors")
    .update({ group_id: groupId } as unknown as never)
    .eq("id", monitorId)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true };
}

export async function toggleGroupCollapsed(
  id: string,
): Promise<GroupFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Get current state
  const { data: group } = await supabase
    .from("monitor_groups")
    .select("collapsed")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!group) {
    return { success: false, error: "Group not found" };
  }

  const { error } = await supabase
    .from("monitor_groups")
    .update({
      collapsed: !(group as { collapsed: boolean }).collapsed,
    } as unknown as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}
