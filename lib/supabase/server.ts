import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "@/lib/env";
import { Database } from "@/types/database";

/**
 * The user's own client: a session, and row level security applies.
 *
 * Named so that a port can say which client it means — the difference
 * between this one and the service-role client is the difference between
 * "the caller's own rows" and "every row".
 */
export type UserClient = SupabaseClient<Database>;

export async function createClient(): Promise<UserClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}
