import * as Sentry from "@sentry/nextjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // this is your Sentry.init call from `sentry.server.config.js`
    // Sentry is initialized in sentry.server.config.ts
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    // this is your Sentry.init call from `sentry.edge.config.js`
    // Sentry is initialized in sentry.edge.config.ts
  }
  if (process.env.NEXT_RUNTIME === "browser") {
    // this is your Sentry.init call from `sentry.client.config.js`
    // Sentry is initialized in sentry.client.config.ts
  }
}

export const onRequestError = Sentry.captureRequestError;
