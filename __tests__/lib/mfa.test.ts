import { describe, expect, it } from "bun:test";

import {
  getMfaVerificationError,
  isMfaVerificationRequired,
  type MfaClient,
} from "@/lib/mfa";

/**
 * The MFA guard sits in front of the routes that change something. The
 * question these tests answer is the one the module exists to answer: does
 * this session still have to prove a second factor?
 *
 * The client is a port, so the fake below is a plain object. Nothing here
 * mocks a module — `mock.module` in Bun is process-wide, and a test that
 * replaced one would silently change what every other test file sees.
 */

function client(
  level: {
    currentLevel?: string | null;
    nextLevel?: string | null;
  } | null,
  error: Error | null = null,
): MfaClient {
  return {
    auth: {
      mfa: {
        async getAuthenticatorAssuranceLevel() {
          return { data: level, error };
        },
      },
    },
  };
}

describe("isMfaVerificationRequired", () => {
  it("is true when the account needs a second factor this session has not used", async () => {
    const supabase = client({ currentLevel: "aal1", nextLevel: "aal2" });

    expect(await isMfaVerificationRequired(supabase)).toBe(true);
  });

  it("is false when the session has already used the second factor", async () => {
    const supabase = client({ currentLevel: "aal2", nextLevel: "aal2" });

    expect(await isMfaVerificationRequired(supabase)).toBe(false);
  });

  it("is false when the account has no second factor enrolled", async () => {
    const supabase = client({ currentLevel: "aal1", nextLevel: "aal1" });

    expect(await isMfaVerificationRequired(supabase)).toBe(false);
  });

  it("is false when the server says nothing", async () => {
    const supabase = client(null);

    expect(await isMfaVerificationRequired(supabase)).toBe(false);
  });

  it("throws when the assurance level cannot be read", async () => {
    // The caller has to be able to tell "no second factor" from "could not
    // find out".
    const supabase = client(null, new Error("network down"));

    await expect(isMfaVerificationRequired(supabase)).rejects.toThrow(
      "network down",
    );
  });
});

describe("getMfaVerificationError", () => {
  it("refuses when a second factor is required", async () => {
    const supabase = client({ currentLevel: "aal1", nextLevel: "aal2" });

    expect(await getMfaVerificationError(supabase)).toBe(
      "MFA verification required",
    );
  });

  it("passes when no second factor is required", async () => {
    const supabase = client({ currentLevel: "aal1", nextLevel: "aal1" });

    expect(await getMfaVerificationError(supabase)).toBeNull();
  });

  it("refuses when the assurance level cannot be read", async () => {
    // An unknown is not a pass. If the level cannot be read, the request
    // is refused rather than let through on the assumption that it is
    // fine.
    const supabase = client(null, new Error("network down"));

    expect(await getMfaVerificationError(supabase)).toBe(
      "Unable to verify MFA status",
    );
  });
});
