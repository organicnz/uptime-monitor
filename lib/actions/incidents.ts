"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { INCIDENT_STATUS } from "@/lib/constants";

const incidentSchema = z.object({
  monitor_id: z.string().min(1, "Monitor is required"),
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().max(2000).optional(),
  status: z.number().min(0).max(2),
});

export type IncidentFormState = {
  success: boolean;
  error?: string;
  id?: string;
};

export async function createIncident(
  formData: FormData,
): Promise<IncidentFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rawData = {
    monitor_id: formData.get("monitor_id") as string,
    title: formData.get("title") as string,
    content: formData.get("content") as string,
    status: parseInt(formData.get("status") as string) || INCIDENT_STATUS.OPEN,
  };

  const parsed = incidentSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid data",
    };
  }

  // Verify monitor belongs to user
  const { data: monitor } = await supabase
    .from("monitors")
    .select("id")
    .eq("id", parsed.data.monitor_id)
    .eq("user_id", user.id)
    .single();

  if (!monitor) {
    return { success: false, error: "Monitor not found" };
  }

  const { data: incident, error } = await supabase
    .from("incidents")
    .insert({
      monitor_id: parsed.data.monitor_id,
      title: parsed.data.title,
      content: parsed.data.content || null,
      status: parsed.data.status,
      started_at: new Date().toISOString(),
    } as unknown as never)
    .select()
    .single();

  if (error || !incident) {
    return {
      success: false,
      error: error?.message || "Failed to create incident",
    };
  }

  revalidatePath("/dashboard/incidents");
  return { success: true, id: (incident as { id: string }).id };
}

export async function updateIncidentStatus(
  id: string,
  status: number,
): Promise<IncidentFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify incident belongs to user's monitor
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, monitor_id, monitors:monitor_id(user_id)")
    .eq("id", id)
    .single();

  if (!incident) {
    return { success: false, error: "Incident not found" };
  }

  const incidentData = incident as { monitors: { user_id: string } | null };
  if (incidentData.monitors?.user_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  const updateData: Record<string, unknown> = { status };

  if (status === INCIDENT_STATUS.RESOLVED) {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("incidents")
    .update(updateData as unknown as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/incidents");
  return { success: true };
}

export async function updateIncident(
  id: string,
  formData: FormData,
): Promise<IncidentFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const status = parseInt(formData.get("status") as string);

  if (!title) {
    return { success: false, error: "Title is required" };
  }

  // Verify incident belongs to user's monitor
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, monitor_id, monitors:monitor_id(user_id)")
    .eq("id", id)
    .single();

  if (!incident) {
    return { success: false, error: "Incident not found" };
  }

  const incidentData = incident as { monitors: { user_id: string } | null };
  if (incidentData.monitors?.user_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  const updateData: Record<string, unknown> = {
    title,
    content: content || null,
    status,
  };

  if (status === INCIDENT_STATUS.RESOLVED) {
    updateData.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("incidents")
    .update(updateData as unknown as never)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/incidents");
  return { success: true };
}

export async function deleteIncident(id: string): Promise<IncidentFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify incident belongs to user's monitor
  const { data: incident } = await supabase
    .from("incidents")
    .select("id, monitors:monitor_id(user_id)")
    .eq("id", id)
    .single();

  if (!incident) {
    return { success: false, error: "Incident not found" };
  }

  const incidentData = incident as { monitors: { user_id: string } | null };
  if (incidentData.monitors?.user_id !== user.id) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase.from("incidents").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/incidents");
  return { success: true };
}
