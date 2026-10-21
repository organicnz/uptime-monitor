import { readFileSync } from "bun:fs";
import { join } from "bun:path";
import { afterEach, describe, expect, it } from "bun:test";

import {
  getAdminUserIds,
  getCronSecret,
  getNotificationDispatchSecret,
  getQstashConfig,
  getServiceRoleKey,
  getSiteUrl,
  getSupabaseEnv,
  getVercelAutomationBypassSecret,
  isEnvError,
} from "@/lib/env";

// bun test auto-loads .env.local, so any of these may already be set.
// Snapshot before mutating and restore after each test.
const saved = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined) {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("getSupabaseEnv", () => {
  it("returns trimmed values", () => {
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "  https://example.supabase.co  ");
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " anon-key ");

    expect(getSupabaseEnv()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("throws a MissingEnvError naming the variable when unset", () => {
    setEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);

    let caught: unknown;
    try {
      getSupabaseEnv();
    } catch (error) {
      caught = error;
    }

    expect(isEnvError(caught)).toBe(true);
    expect((caught as Error).message).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect((caught as Error).message).toContain(".env.local");
  });

  it("treats whitespace-only values as missing", () => {
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "   ");
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    expect(() => getSupabaseEnv()).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("getServiceRoleKey", () => {
  it("returns the key when set", () => {
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    expect(getServiceRoleKey()).toBe("service-key");
  });

  it("warns that the key is server-side only when missing", () => {
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
    expect(() => getServiceRoleKey()).toThrow("Server-side only");
  });
});

describe("optional accessors", () => {
  it("returns undefined for unset optional variables", () => {
    setEnv("CRON_SECRET", undefined);
    setEnv("VERCEL_AUTOMATION_BYPASS_SECRET", undefined);
    setEnv("NOTIFICATION_DISPATCH_SECRET", undefined);

    expect(getCronSecret()).toBeUndefined();
    expect(getVercelAutomationBypassSecret()).toBeUndefined();
    expect(getNotificationDispatchSecret()).toBeUndefined();
  });

  it("returns the value when set", () => {
    setEnv("CRON_SECRET", "cron");
    setEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "bypass");
    setEnv("NOTIFICATION_DISPATCH_SECRET", "dispatch");

    expect(getCronSecret()).toBe("cron");
    expect(getVercelAutomationBypassSecret()).toBe("bypass");
    expect(getNotificationDispatchSecret()).toBe("dispatch");
  });
});

describe("getQstashConfig", () => {
  it("returns token and both signing keys", () => {
    setEnv("QSTASH_TOKEN", "token");
    setEnv("QSTASH_CURRENT_SIGNING_KEY", "current");
    setEnv("QSTASH_NEXT_SIGNING_KEY", "next");

    expect(getQstashConfig()).toEqual({
      token: "token",
      currentSigningKey: "current",
      nextSigningKey: "next",
    });
  });

  it("fails closed when a signing key is missing", () => {
    setEnv("QSTASH_TOKEN", "token");
    setEnv("QSTASH_CURRENT_SIGNING_KEY", undefined);
    setEnv("QSTASH_NEXT_SIGNING_KEY", "next");

    expect(() => getQstashConfig()).toThrow("QSTASH_CURRENT_SIGNING_KEY");
  });
});

describe("getSiteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL over VERCEL_URL", () => {
    setEnv("NEXT_PUBLIC_SITE_URL", "https://status.example.com");
    setEnv("VERCEL_URL", "preview.vercel.app");

    expect(getSiteUrl()).toBe("https://status.example.com");
  });

  it("falls back to VERCEL_URL", () => {
    setEnv("NEXT_PUBLIC_SITE_URL", undefined);
    setEnv("VERCEL_URL", "preview.vercel.app");

    expect(getSiteUrl()).toBe("preview.vercel.app");
  });

  it("returns undefined when neither is set", () => {
    setEnv("NEXT_PUBLIC_SITE_URL", undefined);
    setEnv("VERCEL_URL", undefined);

    expect(getSiteUrl()).toBeUndefined();
  });
});

describe("getAdminUserIds", () => {
  it("returns an empty list when unset", () => {
    setEnv("ADMIN_USER_IDS", undefined);
    expect(getAdminUserIds()).toEqual([]);
  });

  it("splits, trims, and drops empty entries", () => {
    setEnv("ADMIN_USER_IDS", " user-a, user-b ,,user-c,");
    expect(getAdminUserIds()).toEqual(["user-a", "user-b", "user-c"]);
  });
});

describe("isEnvError", () => {
  it("rejects non-env errors", () => {
    expect(isEnvError(new Error("nope"))).toBe(false);
    expect(isEnvError(undefined)).toBe(false);
    expect(isEnvError("MissingEnvError")).toBe(false);
  });
});

/**
 * The public variables a browser can ever see.
 *
 * Next.js inlines a `process.env.NEXT_PUBLIC_*` member access into the client
 * bundle. It does not populate `process.env` as a whole object: the browser's
 * `process` polyfill has an empty `env`. So a whole-object read finds
 * everything on the server and nothing in a browser.
 */
const PUBLIC_ENV_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_SENTRY_DSN",
] as const;

/** Strip comments so a mention of an API in prose is not read as a use. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/)/.test(line))
    .join("\n");
}

const envSource = codeOnly(
  readFileSync(join(import.meta.dir, "..", "..", "lib", "env.ts"), "utf-8"),
);

describe("the browser branch of the environment", () => {
  // The unit suite runs on Bun, where `Bun.env` and `process.env` are the
  // same object, so the browser branch is never executed by the tests above.
  // These assertions read the source instead, and they are the only thing
  // standing between a browser bundle and an empty environment.
  it("reads every public variable with a static member access", () => {
    for (const name of PUBLIC_ENV_VARS) {
      expect(envSource).toContain(`process.env.${name}`);
    }
  });

  it("never reads process.env as a whole object", () => {
    // This is the bug the end-to-end sign-in test found: the browser's
    // `process` polyfill has an empty `env`, so `const ENV = process.env`
    // compiles to nothing, and the Supabase client could not find its URL.
    expect(envSource.match(/process\.env(?!\.)/g)).toBeNull();
  });
});
