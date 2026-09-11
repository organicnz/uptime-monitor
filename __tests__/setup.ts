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
}));

mock.module("@/lib/actions/monitors", () => ({
  duplicateMonitor: async () => ({ success: false, error: "mocked" }),
}));
