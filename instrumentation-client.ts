import * as Sentry from "@sentry/nextjs";

// Client entrypoint (Next 15+ App Router + Turbopack). This replaces the
// legacy sentry.client.config.ts pattern.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,

  // Capture 100% of traces in dev, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});

// Instrument client-side router transitions for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
