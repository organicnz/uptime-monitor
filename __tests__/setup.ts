import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mock } from "bun:test";

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
