import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// The build and the server both run on Bun, so `Bun.env` is the accessor
// for build-time configuration. It is the same live object as `process.env`.
//
// A local Supabase origin has to be in the CSP `connect-src` allowlist. When
// the variable is missing the block is silently dropped, which turns into
// "why is my local realtime connection blocked?" hours later.
const configuredSupabaseOrigin = (() => {
  const configured = Bun.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!configured) {
    if (Bun.env.NODE_ENV !== "test") {
      console.warn(
        "[next.config] NEXT_PUBLIC_SUPABASE_URL is unset; the CSP " +
          "connect-src allowlist cannot include it.",
      );
    }
    return "";
  }

  try {
    const origin = new URL(configured).origin;
    return origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("http://localhost:")
      ? origin
      : "";
  } catch {
    console.warn(
      `[next.config] NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${configured}`,
    );
    return "";
  }
})();

const connectSources = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://va.vercel-scripts.com",
  "https://*.sentry.io",
  ...(configuredSupabaseOrigin ? [configuredSupabaseOrigin] : []),
].join(" ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSources}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The build does not type check. Type checking is a separate, faster
  // gate: `tsrs` is the Rust port of the TypeScript compiler that checks
  // the same project against real TypeScript semantics, and it is the only
  // type checker in the repository. It runs in the typecheck workflow, and
  // the build would otherwise repeat the work with the slowest of the two.
  typescript: {
    ignoreBuildErrors: true,
  },
  // No `turbopack.root`: Next.js detects the project root from the lockfile
  // (bun.lock), which is more accurate than a path derived from the current
  // working directory.
  headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Cache policy for the two route families that need one. These used to
      // live in vercel.json, which only works on Vercel; the app is served
      // from its own Bun container, so the policy belongs to the framework.
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },
      {
        source: "/status/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },
    ];
  },
  // Disable x-powered-by header
  poweredByHeader: false,
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: Bun.env.SENTRY_ORG,
  project: Bun.env.SENTRY_PROJECT,

  // Auth token for source-map upload during `next build` in CI.
  // Keep secret: provide via SENTRY_AUTH_TOKEN env (GitHub Actions secret).
  authToken: Bun.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !Bun.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  sourcemaps: {
    disable: Bun.env.NODE_ENV === "development",
  },
});
