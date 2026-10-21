import * as Sentry from "@sentry/nextjs";

import { getClientSentryEnvironment } from "@/lib/client-env";

// Client entrypoint (Next 15+ App Router + Turbopack). This replaces the
// legacy sentry.client.config.ts pattern.
//
// The environment values below are inlined into the bundle by Next.js at
// build time, so the browser never reads a live environment.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: getClientSentryEnvironment(),

  // Capture 100% of traces in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

// Instrument client-side router transitions for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
