/**
 * Single source of truth for required environment.
 *
 * Previously every Supabase client read `process.env.X!`, which suppresses the
 * type error and turns a missing variable into a runtime throw from inside the
 * SDK. These helpers fail at the call site with a message naming the variable
 * and where to set it.
 */

const SUPABASE_URL_HINT =
  "Set it in .env.local (see .env.local.example) and in the Vercel project environment.";

class MissingEnvError extends Error {
  constructor(name: string, hint: string) {
    super(`Missing required environment variable ${name}. ${hint}`);
    this.name = "MissingEnvError";
  }
}

function read(name: string): string | undefined {
  const value = process.env[name];
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
 * Users allowed to change the global check schedule. Empty means "fall back to
 * app_metadata.role === 'admin' in the route", so it is optional by design.
 */
export function getAdminUserIds(): string[] {
  return (optional("ADMIN_USER_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Sentry environment for the browser bundle. `VERCEL_ENV` is not inlined into
 * client code (only `NEXT_PUBLIC_*` is), so the client needs its own
 * explicitly configured copy. Optional; falls back to NODE_ENV.
 */
export function getClientSentryEnvironment(): string {
  return (
    optional("NEXT_PUBLIC_VERCEL_ENV") ?? optional("NODE_ENV") ?? "unknown"
  );
}

export function isEnvError(error: unknown): error is MissingEnvError {
  return error instanceof MissingEnvError;
}

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
