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

  const original = data as unknown as Monitor;
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
    .insert([monitorCopy] as unknown as never)
    .select()
    .single();

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/monitors");

  const newId = (newMonitor as unknown as { id: string }).id;
  return { success: true, id: newId, name: newName };
}
