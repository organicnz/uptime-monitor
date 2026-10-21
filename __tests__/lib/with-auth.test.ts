import { describe, expect, it, mock } from "bun:test";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

  it("turns a handler that throws into a 500", async () => {
    // The handler's own error must not reach the client: it can carry
    // the shape of the database, and the response is what a stranger sees.
    const response = await withAuth(async () => {
      throw new Error("connection to the internal database refused");
    });

    expect(response.status).toBe(500);
    const body = (await response.json()) as unknown;
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("internal database");
  });
});
