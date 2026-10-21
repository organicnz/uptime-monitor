/**
 * Browser-side environment.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` into the client bundle at build
 * time. The bundler substitutes those values by matching the exact
 * `process.env.NAME` text, so the member accesses below must stay in that
 * form — a dynamic `process.env[name]` lookup would not be inlined.
 *
 * `process.env` here is not a Node.js dependency: it is the substitution
 * mechanism Next.js provides for browser code. The server never imports this
 * module; it reads the live process environment through `lib/env.ts`.
 */

/**
 * Deployment environment reported to Sentry from the browser.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is the explicit override; `NODE_ENV` is inlined
 * by Next.js into every bundle, so this resolves to "development" or
 * "production" without a runtime lookup.
 */
export function getClientSentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"
  );
}
