import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

let serviceClient: SupabaseClient<Database> | null = null;

/**
 * Service role client for server-side operations that bypass RLS.
 * Only use this for trusted server-side code (cron jobs, webhooks, etc.)
 * @throws Error if environment variables are missing
 */
export function createServiceClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  serviceClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return serviceClient;
}
