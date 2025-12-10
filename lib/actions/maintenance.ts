"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

const maintenanceSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  active: z.boolean().default(true),
  strategy: z.enum(["manual", "single", "recurring"]).default("manual"),
  monitor_ids: z.array(z.string()).optional(),
});

export type MaintenanceFormState = {
  success: boolean;
  error?: string;
  id?: string;
};

export async function createMaintenance(
  formData: FormData,
): Promise<MaintenanceFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rawData = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    start_date: formData.get("start_date") as string,
    end_date: formData.get("end_date") as string,
    active: formData.get("active") === "true",
    strategy: (formData.get("strategy") as string) || "manual",
    monitor_ids: formData.getAll("monitor_ids") as string[],
  };

  const parsed = maintenanceSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid data",
    };
  }

  const { monitor_ids, ...maintenanceData } = parsed.data;

  // Validate dates
  const startDate = new Date(maintenanceData.start_date);
  const endDate = new Date(maintenanceData.end_date);

  if (endDate <= startDate) {
    return { success: false, error: "End date must be after start date" };
  }

  // Create maintenance window
  const { data: maintenance, error: maintenanceError } = await supabase
    .from("maintenance")
    .insert({
      user_id: user.id,
      title: maintenanceData.title,
      description: maintenanceData.description || null,
      start_date: maintenanceData.start_date,
      end_date: maintenanceData.end_date,
      active: maintenanceData.active,
      strategy: maintenanceData.strategy,
    } as unknown as never)
    .select()
    .single();

  if (maintenanceError || !maintenance) {
    return {
      success: false,
      error: maintenanceError?.message || "Failed to create maintenance",
    };
  }

  const maintenanceRecord = maintenance as { id: string };

  // Assign monitors if provided
  if (monitor_ids && monitor_ids.length > 0) {
    const monitorAssignments = monitor_ids.map((monitor_id) => ({
      maintenance_id: maintenanceRecord.id,
      monitor_id,
    }));

    const { error: assignError } = await supabase
      .from("maintenance_monitors")
      .insert(monitorAssignments as unknown as never);

    if (assignError) {
      console.error("Failed to assign monitors:", assignError);
    }
  }

  revalidatePath("/dashboard/maintenance");
  redirect("/dashboard/maintenance");
}

export async function updateMaintenance(
  id: string,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const rawData = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    start_date: formData.get("start_date") as string,
    end_date: formData.get("end_date") as string,
    active: formData.get("active") === "true",
    strategy: (formData.get("strategy") as string) || "manual",
    monitor_ids: formData.getAll("monitor_ids") as string[],
  };

  const parsed = maintenanceSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || "Invalid data",
    };
  }

  const { monitor_ids, ...maintenanceData } = parsed.data;

  // Validate dates
  const startDate = new Date(maintenanceData.start_date);
  const endDate = new Date(maintenanceData.end_date);

  if (endDate <= startDate) {
    return { success: false, error: "End date must be after start date" };
  }

  // Update maintenance window
  const { error: updateError } = await supabase
    .from("maintenance")
    .update({
      title: maintenanceData.title,
      description: maintenanceData.description || null,
      start_date: maintenanceData.start_date,
      end_date: maintenanceData.end_date,
      active: maintenanceData.active,
      strategy: maintenanceData.strategy,
    } as unknown as never)
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Update monitor assignments
  // First, remove existing assignments
  await supabase.from("maintenance_monitors").delete().eq("maintenance_id", id);

  // Then add new assignments
  if (monitor_ids && monitor_ids.length > 0) {
    const monitorAssignments = monitor_ids.map((monitor_id) => ({
      maintenance_id: id,
      monitor_id,
    }));

    await supabase
      .from("maintenance_monitors")
      .insert(monitorAssignments as unknown as never);
  }

  revalidatePath("/dashboard/maintenance");
  redirect("/dashboard/maintenance");
}

export async function deleteMaintenance(
  id: string,
): Promise<MaintenanceFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Delete maintenance (cascade will delete monitor assignments)
  const { error } = await supabase
    .from("maintenance")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/maintenance");
  return { success: true };
}
