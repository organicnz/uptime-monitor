import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { getServiceRoleKey, getSupabaseEnv } from "@/lib/env";

let serviceClient: SupabaseClient<Database> | null = null;

/**
 * Service role client for server-side operations that bypass RLS: cron jobs
 * and notification delivery.
 *
 * Only use for trusted server-side code. Notification credentials are not
 * readable through the anon/authenticated clients by design, so delivery
 * resolves them through the owner-checked `notification_channel_secrets` RPC
 * rather than by widening this client's reach.
 *
 * @throws MissingEnvError naming the variable that is absent
 */
export function createServiceClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;

  const { url } = getSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  serviceClient = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}
