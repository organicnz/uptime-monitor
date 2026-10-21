import { describe, expect, it } from "bun:test";

/**
 * The service role client.
 *
 * Small, but it is the one client that bypasses row level security, so the
 * two properties worth pinning down are that it fails loudly when the
 * environment is incomplete, and that it is memoized rather than built per
 * call.
 */

/**
 * The module's own type.
 *
 * The import below is dynamic — the query string is what makes it a
 * *different* copy of the module, with an empty memo — and a dynamic
 * import of a non-literal specifier is `any` to the compiler. Naming the
 * type is what keeps the test's own assertions typed.
 */
type ServiceModule = typeof import("@/lib/supabase/service");

/** A fresh copy of the module, so the memoized client starts empty. */
function freshModule(): Promise<ServiceModule> {
  return import(
    `@/lib/supabase/service?fresh=${Date.now()}-${Math.random()}`
  ) as Promise<ServiceModule>;
}

const ORIGINAL_ENV = {
  url: Bun.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: Bun.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  key: Bun.env.SUPABASE_SERVICE_ROLE_KEY,
};

function restoreEnv(): void {
  for (const [name, value] of [
    ["NEXT_PUBLIC_SUPABASE_URL", ORIGINAL_ENV.url],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", ORIGINAL_ENV.anonKey],
    ["SUPABASE_SERVICE_ROLE_KEY", ORIGINAL_ENV.key],
  ] as const) {
    if (value === undefined) delete Bun.env[name];
    else Bun.env[name] = value;
  }
}

describe("service role client", () => {
  it("fails loudly when the environment is incomplete", async () => {
    delete Bun.env.NEXT_PUBLIC_SUPABASE_URL;
    delete Bun.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete Bun.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const { createServiceClient } = await freshModule();
      expect(() => createServiceClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    } finally {
      restoreEnv();
    }
  });

  it("fails loudly when the service role key is missing", async () => {
    Bun.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    Bun.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    delete Bun.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const { createServiceClient } = await freshModule();
      expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    } finally {
      restoreEnv();
    }
  });

  it("builds a client and memoizes it", async () => {
    Bun.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    Bun.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    Bun.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    try {
      const { createServiceClient } = await freshModule();
      const first = createServiceClient();
      const second = createServiceClient();

      expect(first).toBeDefined();
      // The same instance: a client per call would open a new connection
      // pool on every check.
      expect(second).toBe(first);
    } finally {
      restoreEnv();
    }
  });
});
