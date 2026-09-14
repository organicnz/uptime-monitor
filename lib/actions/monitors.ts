"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { track } from "@vercel/analytics/server";
import type { Monitor } from "@/types/application";

/**
 * Fire-and-forget analytics that can never fail a server action.
 * track() may throw/reject when Web Analytics isn't provisioned for the
 * project (the dashboard shows "Failed to load script from
 * /_vercel/insights/script.js" in that case), which would otherwise turn
 * create/update/duplicate/delete into 500s.
 */
function safeTrack(event: string, props?: Parameters<typeof track>[1]) {
  try {
    const result = track(event, props) as unknown as
      Promise<unknown> | undefined;
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // Analytics must never break monitor mutations.
  }
}

// NOTE: Monitor row type is imported canonically from @/types/application
// (mirrors types/database.ts <- supabase/schema.sql). Do not redefine it
// locally so schema changes propagate and drift cannot reoccur.

type DuplicateResult =
  | { success: true; id: string; name: string }
  | { success: false; error: string };

export async function duplicateMonitor(
  monitorId: string,
): Promise<DuplicateResult> {
  try {
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
      if (insertError.code === "42501") {
        console.error(
          `[RLS AUDIT] User ${user.id} attempted to duplicate monitor ${monitorId} but was denied by RLS policies.`,
        );
      } else {
        console.error("Failed to duplicate monitor:", insertError);
      }
      return {
        success: false,
        error: "Failed to duplicate monitor. Please try again.",
      };
    }

    safeTrack("Monitor Duplicated", { type: original.type });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/monitors");

    const newId = (newMonitor as unknown as { id: string }).id;
    return { success: true, id: newId, name: newName };
  } catch (err) {
    // Never leak a 500 to the client: log server-side (Vercel Function
    // Logs / Sentry) and return a safe message instead.
    console.error(`[duplicateMonitor] Unhandled error for ${monitorId}:`, err);
    return {
      success: false,
      error: "Failed to duplicate monitor. Please try again.",
    };
  }
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
  try {
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
      if (error.code === "42501") {
        console.error(
          `[RLS AUDIT] User ${user.id} attempted to create monitor but was denied by RLS policies. payload:`,
          parsed.data,
        );
      } else {
        console.error("Create monitor error:", error);
      }
      return { error: "Failed to create monitor. Please try again." };
    }

    safeTrack("Monitor Created", { type: parsed.data.type });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/monitors");
    return { success: true, monitor: data as unknown as Monitor };
  } catch (err) {
    console.error("[createMonitor] Unhandled error:", err);
    return { error: "Failed to create monitor. Please try again." };
  }
}

export async function updateMonitor(id: string, payload: unknown) {
  try {
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
      if (error.code === "42501") {
        console.error(
          `[RLS AUDIT] User ${user.id} attempted to update monitor ${id} but was denied by RLS policies. payload:`,
          parsed.data,
        );
      } else {
        console.error("Update monitor error:", error);
      }
      return { error: "Failed to update monitor. Please try again." };
    }

    safeTrack("Monitor Updated", { type: parsed.data.type });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/monitors/${id}`);
    return { success: true };
  } catch (err) {
    console.error(`[updateMonitor] Unhandled error for monitor ${id}:`, err);
    return { error: "Failed to update monitor. Please try again." };
  }
}

export async function deleteMonitor(id: string) {
  try {
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
      if (error.code === "42501") {
        console.error(
          `[RLS AUDIT] User ${user.id} attempted to delete monitor ${id} but was denied by RLS policies.`,
        );
      } else {
        console.error("Delete monitor error:", error);
      }
      return { error: "Failed to delete monitor. Please try again." };
    }

    safeTrack("Monitor Deleted");

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/monitors");
    return { success: true };
  } catch (err) {
    console.error(`[deleteMonitor] Unhandled error for monitor ${id}:`, err);
    return { error: "Failed to delete monitor. Please try again." };
  }
}
