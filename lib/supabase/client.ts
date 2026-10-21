import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "@/lib/env";
import { Database } from "@/types/database";

export function createClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createBrowserClient<Database>(url, anonKey);
}
