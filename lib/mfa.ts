import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function isMfaVerificationRequired(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw error;
  }
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

export async function getMfaVerificationError(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  try {
    return (await isMfaVerificationRequired(supabase))
      ? "MFA verification required"
      : null;
  } catch {
    return "Unable to verify MFA status";
  }
}
