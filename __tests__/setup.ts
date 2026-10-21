import { mock } from "bun:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

await GlobalRegistrator.register();

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    replace: () => {},
    prefetch: () => {},
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  // Pages under test import these. Both throw in production, and returning
  // normally would let a component render past a guard it relies on.
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

mock.module("@/lib/actions/monitors", () => ({
  duplicateMonitor: async () => ({ success: false, error: "mocked" }),
}));

/**
 * The Supabase server client reads cookies from `next/headers`, which needs
 * a request context a unit test does not have — so every test that reaches
 * it replaces it with a fake.
 *
 * `mock.module` is process-wide, which means the *order* of the test files
 * decided whether the real module was ever evaluated. That made the suite's
 * behaviour depend on the order it ran in, and it made the set of files
 * the coverage report measured depend on it too: the same commit could
 * pass the coverage gate or fail it.
 *
 * Registering the default here, before any test file loads, settles it. The
 * real module is never evaluated, and a test that needs a different fake
 * registers its own, which replaces this one.
 */
mock.module("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
    // A chainable builder that resolves to nothing, so a test that reaches
    // a query it did not stub gets an empty result rather than a crash.
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.insert = self;
      chain.update = self;
      chain.upsert = self;
      chain.delete = self;
      chain.eq = self;
      chain.gte = self;
      chain.lte = self;
      chain.order = self;
      chain.limit = async () => ({ data: [], error: null });
      chain.single = async () => ({ data: null, error: null });
      chain.maybeSingle = async () => ({ data: null, error: null });
      return chain;
    },
  }),
}));
