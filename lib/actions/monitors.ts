"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Monitor = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  url: string | null;
  hostname: string | null;
  port: number | null;
  method: string | null;
  keyword: string | null;
  headers: Record<string, string> | null;
  body: string | null;
  interval: number;
  timeout: number;
  max_retries: number;
  ignore_tls: boolean;
  upside_down: boolean;
  description: string | null;
  active: boolean;
};

type DuplicateResult =
  | { success: true; id: string; name: string }
  | { success: false; error: string };

export async function duplicateMonitor(
  monitorId: string,
): Promise<DuplicateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch the original monitor
  const { data, error: fetchError } = await supabase
    .from("monitors")
    .select("*")
    .eq("id", monitorId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !data) {
    return { success: false, error: "Monitor not found" };
  }

  const original = data;
  const newName = `${original.name} (Copy)`;

  // Create a copy without id, created_at, updated_at
  const monitorCopy = {
    user_id: user.id,
    name: newName,
    type: original.type,
    url: original.url,
    hostname: original.hostname,
    port: original.port,
    method: original.method,
    keyword: original.keyword,
    headers: original.headers,
    body: original.body,
    interval: original.interval,
    timeout: original.timeout,
    max_retries: original.max_retries,
    ignore_tls: original.ignore_tls,
    upside_down: original.upside_down,
    description: original.description,
    active: false, // Start paused so user can review before activating
  };

  const { data: newMonitor, error: insertError } = await supabase
    .from("monitors")
    .insert([monitorCopy])
    .select()
    .single();

  if (insertError) {
    console.error("Failed to duplicate monitor:", insertError);
    return {
      success: false,
      error: "Failed to duplicate monitor. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");

  const newId = (newMonitor as unknown as { id: string }).id;
  return { success: true, id: newId, name: newName };
}

import { z } from "zod";

export const MonitorSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    type: z.enum(["http", "tcp", "ping", "keyword", "dns"]),
    url: z.string().url().optional().nullable().or(z.literal("")),
    hostname: z.string().optional().nullable().or(z.literal("")),
    port: z.coerce.number().min(1).max(65535).optional().nullable(),
    method: z.string().optional().nullable(),
    keyword: z.string().optional().nullable().or(z.literal("")),
    interval: z.coerce.number().min(30).max(86400).default(60),
    timeout: z.coerce.number().min(1).max(120).default(30),
    max_retries: z.coerce.number().min(0).max(10).default(3),
    description: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (["http", "keyword"].includes(data.type)) {
        return !!data.url;
      }
      if (["tcp", "ping", "dns"].includes(data.type)) {
        return !!data.hostname;
      }
      return true;
    },
    { message: "URL or Hostname is required based on type" },
  );

export async function createMonitor(payload: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const parsed = MonitorSchema.safeParse(payload);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("monitors")
    .insert([
      {
        user_id: user.id,
        ...parsed.data,
        active: true,
        url: parsed.data.url || null,
        hostname: parsed.data.hostname || null,
        keyword: parsed.data.keyword || null,
        description: parsed.data.description || null,
      },
    ] as unknown as never)
    .select()
    .single();

  if (error) {
    console.error("Create monitor error:", error);
    return { error: "Failed to create monitor. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true, monitor: data as unknown as Monitor };
}

export async function updateMonitor(id: string, payload: unknown) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const parsed = MonitorSchema.safeParse(payload);

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { error } = await supabase
    .from("monitors")
    .update({
      ...parsed.data,
      url: parsed.data.url || null,
      hostname: parsed.data.hostname || null,
      keyword: parsed.data.keyword || null,
      description: parsed.data.description || null,
    } as unknown as never)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Update monitor error:", error);
    return { error: "Failed to update monitor. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/monitors/${id}`);
  return { success: true };
}

export async function deleteMonitor(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("monitors")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Delete monitor error:", error);
    return { error: "Failed to delete monitor. Please try again." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");
  return { success: true };
}
