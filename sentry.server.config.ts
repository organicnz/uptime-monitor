import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry configuration.
 *
 * This file is only loaded for the `nodejs` runtime, which the app serves
 * from Bun — so `Bun.env` is the accessor. It is the same live object as
 * `process.env`, read from the running process rather than frozen at build
 * time.
 */
Sentry.init({
  dsn: Bun.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: Bun.env.VERCEL_ENV ?? Bun.env.NODE_ENV,

  // Traces sample rate - only available in nodejs runtime
  tracesSampleRate: Bun.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
