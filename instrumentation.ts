import * as Sentry from "@sentry/nextjs";

/**
 * Next.js sets `NEXT_RUNTIME` before this module loads, in every runtime it
 * supports — the `nodejs` runtime (Bun, for this app) and the `edge` runtime
 * (a V8 isolate with no `Bun` global). The probe therefore uses the
 * `process.env` form, which Next.js provides in both, rather than `Bun.env`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors from Server Components, route handlers, and middleware.
export const onRequestError = Sentry.captureRequestError;
