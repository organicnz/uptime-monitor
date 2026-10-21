import * as Sentry from "@sentry/nextjs";

/**
 * Edge-runtime Sentry configuration.
 *
 * The edge runtime is a V8 isolate, not a Node.js process and not Bun: it has
 * no `Bun` global, and Next.js supplies `process.env` there as its own
 * substitution mechanism. So this file keeps the `process.env` form on
 * purpose — the sibling `sentry.server.config.ts` uses `Bun.env` because it
 * really does run on Bun.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

  // Traces sample rate for edge runtime
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
