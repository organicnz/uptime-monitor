import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";
import { Database } from "@/types/database";

/**
 * The public client: the anon key, and no session.
 *
 * Named so that a port can say which client it means — the difference
 * between this one and the user's own is the difference between "what
 * anyone may read" and "what this reader may read".
 *
 * The important part is what it does *not* do: it reads no cookies, so
 * a route that uses it does not become dynamic. A public page that reads
 * the database is a page the framework can prerender, and a prerendered
 * page is one the origin is not asked for on every request.
 *
 * Row level security still applies. The functions this page calls are
 * granted to `anon` explicitly and return public rows, so nothing here
 * widens what a stranger can read.
 */
export type PublicClient = SupabaseClient<Database>;

let publicClient: PublicClient | null = null;

/**
 * The anon client, for server-side reads that anyone may make.
 *
 * @throws MissingEnvError naming the variable that is absent
 */
export function createPublicClient(): PublicClient {
  if (publicClient) return publicClient;

  const { url, anonKey } = getSupabaseEnv();

  publicClient = createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return publicClient;
}
