import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { getServiceRoleKey, getSupabaseEnv } from "@/lib/env";
import { Database } from "@/types/database";

let serviceClient: SupabaseClient<Database> | null = null;

/**
 * The service-role client: no session, and row level security does not
 * apply.
 *
 * Named so that a port can say which client it means.
 */
export type ServiceClient = SupabaseClient<Database>;

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
export function createServiceClient(): ServiceClient {
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
