/**
 * Single source of truth for required environment.
 *
 * Previously every Supabase client read `process.env.X!`, which suppresses the
 * type error and turns a missing variable into a runtime throw from inside the
 * SDK. These helpers fail at the call site with a message naming the variable
 * and where to set it.
 *
 * Where the environment comes from depends on the runtime:
 *
 * - **Server.** The app runs on Bun. `Bun.env` is the canonical accessor and
 *   is the very same live object as `process.env`, so a value is read from
 *   the running process rather than frozen at build time.
 * - **Browser.** A browser bundle has no `Bun` global. Next.js inlines a
 *   `process.env.NEXT_PUBLIC_*` *member access* into the client bundle at
 *   build time, and those are the only variables a browser can ever see.
 *
 * Both branches expose the same shape, so the accessors below are isomorphic:
 * one module serves server components, route handlers and the browser bundle.
 */

const SUPABASE_URL_HINT =
  "Set it in .env.local (see .env.local.example) and in the Vercel project environment.";

class MissingEnvError extends Error {
  constructor(name: string, hint: string) {
    super(`Missing required environment variable ${name}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

/**
 * The environment for this runtime, resolved once at module load.
 *
 * `Bun.env` and `process.env` are the same object on Bun, so the server
 * branch is a live view of the running process, not a snapshot.
 *
 * The browser branch cannot work the same way. Next.js inlines a
 * `process.env.NEXT_PUBLIC_*` *member access* into the client bundle at
 * build time; it does not populate `process.env` as a whole object — the
 * browser's `process` polyfill has an empty `env`. A dynamic `ENV[name]`
 * lookup therefore finds nothing in a browser, which is how the browser
 * Supabase client ended up unable to find its own URL.
 *
 * So every public variable is read here with that exact member-access form,
 * and the list is the complete public surface. An accessor added later for a
 * new `NEXT_PUBLIC_*` variable has to be added here too, or it will find
 * nothing in a browser and everything on the server.
 */
const ENV: Record<string, string | undefined> =
  typeof Bun === "undefined"
    ? {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
        NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
      }
    : Bun.env;

function read(name: string): string | undefined {
  const value = ENV[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function required(name: string, hint: string): string {
  const value = read(name);
  if (value === undefined) throw new MissingEnvError(name, hint);
  return value;
}

function optional(name: string): string | undefined {
  return read(name);
}

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

/**
 * Read per call rather than caching: on Vercel, a variable can be added to a
 * deployment without a rebuild, and a module-level cache would pin whatever
 * was present when the instance was first warmed.
 */
export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL_HINT),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_URL_HINT),
  };
}

export function getServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Server-side only. Never expose it to the browser or commit it.",
  );
}

export function getCronSecret(): string | undefined {
  return optional("CRON_SECRET");
}

export function getQstashConfig(): {
  token: string;
  currentSigningKey: string;
  nextSigningKey: string;
} {
  return {
    token: required(
      "QSTASH_TOKEN",
      "Only needed when scheduling monitor checks with QStash.",
    ),
    // These used to default to "" in the cron route, which built a Receiver
    // that rejected every signature and turned a config error into a silent
    // 401. Fail closed instead.
    currentSigningKey: required(
      "QSTASH_CURRENT_SIGNING_KEY",
      "Only needed when scheduling monitor checks with QStash.",
    ),
    nextSigningKey: required(
      "QSTASH_NEXT_SIGNING_KEY",
      "Only needed when scheduling monitor checks with QStash.",
    ),
  };
}

export function getVercelAutomationBypassSecret(): string | undefined {
  return optional("VERCEL_AUTOMATION_BYPASS_SECRET");
}

export function getSiteUrl(): string | undefined {
  return optional("NEXT_PUBLIC_SITE_URL") ?? optional("VERCEL_URL");
}

export function getNotificationDispatchSecret(): string | undefined {
  return optional("NOTIFICATION_DISPATCH_SECRET");
}

/**
 * Whether this deployment is served by Vercel.
 *
 * Vercel sets `VERCEL=1` in every build and every runtime it owns, and
 * nothing else does. The app also runs from its own container, and there
 * are Vercel-shaped things — the analytics script, the deployment
 * protection bypass — that only mean something on Vercel.
 *
 * The analytics script is the reason this accessor exists: the script
 * is fetched from `/_vercel/insights/script.js`, which Vercel's own
 * platform serves. Everywhere else the request is a 404, and a 404 for
 * a script is a console error on every page load — an error a reader
 * sees in the console and a test asserts against.
 *
 * Server-side only. `VERCEL` is not a public variable, so a browser
 * bundle cannot see it; call this from a server component.
 */
export function isVercelDeployment(): boolean {
  return optional("VERCEL") === "1";
}

/**
 * Users allowed to change the global check schedule. Empty means "fall back to
 * app_metadata.role === 'admin' in the route", so it is optional by design.
 */
export function getAdminUserIds(): string[] {
  return (optional("ADMIN_USER_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isEnvError(error: unknown): error is MissingEnvError {
  return error instanceof MissingEnvError;
}

/**
 * The environment variables the app cannot start without.
 *
 * Single source of truth: the accessors above read these, and
 * `scripts/doctor.ts` reports on them.
 */
export const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/**
 * Every variable the app reads at runtime, for the drift test that keeps
 * .env.local.example honest.
 */
export const DOCUMENTED_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "CRON_SECRET",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "NOTIFICATION_DISPATCH_SECRET",
  "ADMIN_USER_IDS",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_VERCEL_ENV",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
] as const;
