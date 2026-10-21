/**
 * The bit of the Supabase client this module uses.
 *
 * The full client is a big type to hand a test, and the module reads
 * exactly one thing from it. Naming that thing is also how the module
 * says what it needs: an authenticator assurance level, and nothing else.
 */
export type MfaClient = {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel(): Promise<{
        data: {
          currentLevel?: string | null;
          nextLevel?: string | null;
        } | null;
        error: Error | null;
      }>;
    };
  };
};

/**
 * Whether the caller still has to prove a second factor.
 *
 * True when the session is at `aal1` and the account is enrolled at
 * `aal2`: the user has a second factor, and this session has not used it
 * yet.
 */
export async function isMfaVerificationRequired(
  supabase: MfaClient,
): Promise<boolean> {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) {
    throw error;
  }
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

/**
 * The message to refuse a request with, or null when there is nothing to
 * refuse.
 *
 * A failure to *read* the assurance level is not the same as "no second
 * factor needed": it is an unknown, and an unknown is treated as a
 * refusal rather than as a pass.
 */
export async function getMfaVerificationError(
  supabase: MfaClient,
): Promise<string | null> {
  try {
    return (await isMfaVerificationRequired(supabase))
      ? "MFA verification required"
      : null;
  } catch {
    return "Unable to verify MFA status";
  }
}
