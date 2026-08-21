import * as Sentry from "@sentry/nextjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // this is your Sentry.init call from `sentry.server.config.js`
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    // this is your Sentry.init call from `sentry.edge.config.js`
  }
}

export const onRequestError = Sentry.captureRequestError;
