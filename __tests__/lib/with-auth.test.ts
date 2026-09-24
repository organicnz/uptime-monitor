import { describe, expect, it, mock } from "bun:test";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

const user = { id: "user-id" } as User;

mock.module("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
  }),
}));

const { withAuth } = await import("@/lib/api-utils/with-auth");

describe("withAuth", () => {
  it("passes the handler response through without changing its status", async () => {
    const response = await withAuth(async () =>
      NextResponse.json({ ok: true }, { status: 201 }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("allows handlers to opt into MFA enforcement", async () => {
    const response = await withAuth(
      async () => NextResponse.json({ ok: true }),
      { requireMfa: true },
    );

    expect(response.status).toBe(200);
  });
});
