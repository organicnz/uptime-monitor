import { afterEach, describe, expect, it } from "bun:test";

import { getClientSentryEnvironment } from "@/lib/client-env";

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

describe("getClientSentryEnvironment", () => {
  it("prefers NEXT_PUBLIC_VERCEL_ENV", () => {
    setEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    setEnv("NODE_ENV", "production");

    expect(getClientSentryEnvironment()).toBe("preview");
  });

  it("falls back to NODE_ENV", () => {
    setEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    setEnv("NODE_ENV", "production");

    expect(getClientSentryEnvironment()).toBe("production");
  });

  it("returns 'unknown' when neither is set", () => {
    setEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    setEnv("NODE_ENV", undefined);

    expect(getClientSentryEnvironment()).toBe("unknown");
  });
});
