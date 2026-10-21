import { expect, test } from "@playwright/test";

/**
 * Auth boundary coverage for the JSON API surface.
 *
 * These assertions must hold for anonymous callers on every deployment: they
 * need no Supabase instance and no seeded credentials, so they run identically
 * in local dev and CI. Anything here regressing is a security regression.
 */

const PROTECTED_ENDPOINTS: ReadonlyArray<{
  method: "get" | "post";
  path: string;
}> = [
  { method: "get", path: "/api/notifications/channels" },
  { method: "get", path: "/api/status-pages" },
  { method: "get", path: "/api/settings/schedule" },
];

test.describe("API auth boundaries (anonymous)", () => {
  for (const { method, path } of PROTECTED_ENDPOINTS) {
    test(`${method.toUpperCase()} ${path} rejects anonymous callers`, async ({
      request,
    }) => {
      const response = await request[method](path);

      expect(response.status()).toBe(401);
      // Must not leak internals in the error body.
      const body = await response.text();
      expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(body).not.toContain("stack");
    });
  }

  test("cron health probe stays public and leaks no config", async ({
    request,
  }) => {
    const response = await request.get("/api/cron/check-monitors?health=true");

    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("CRON_SECRET");
    expect(body).not.toContain("service_role");
  });

  test("cron mutations reject anonymous callers and forged tokens", async ({
    request,
  }) => {
    const anonymous = await request.post("/api/cron/check-monitors");
    expect(anonymous.status()).toBe(401);

    // A wrong-but-plausible secret must not be accepted.
    const forged = await request.post("/api/cron/check-monitors", {
      headers: {
        authorization: "Bearer not-the-real-cron-secret",
        "x-cron-secret": "not-the-real-cron-secret",
      },
    });
    expect(forged.status()).toBe(401);
  });

  test("cron mutations reject a near-miss secret prefix", async ({
    request,
  }) => {
    // Guards against prefix/startsWith comparisons in secret validation.
    const response = await request.post("/api/cron/check-monitors", {
      headers: { authorization: "Bearer e2e-cron-secret-but-longer" },
    });

    expect(response.status()).toBe(401);
  });

  test("status page collection rejects anonymous listing", async ({
    request,
  }) => {
    const response = await request.get("/api/status-pages");

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unauthorized",
    });
  });

  test("unknown status page slug does not leak monitor details", async ({
    request,
  }) => {
    const response = await request.get(
      "/status/definitely-not-a-real-slug-12345",
    );

    // Either a 404 or a page that exists but shows no monitor internals.
    const body = await response.text();
    expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

test.describe("security headers", () => {
  test("responses carry the hardened header set", async ({ request }) => {
    const response = await request.get("/");

    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["strict-transport-security"]).toContain(
      "max-age=",
    );
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("middleware blocks spoofed x-middleware-subrequest", async ({
    request,
  }) => {
    // CVE-2025-29927 (React2Shell) mitigation must stay in place.
    const response = await request.get("/", {
      headers: { "x-middleware-subrequest": "1" },
    });

    expect(response.status()).toBe(403);
  });
});
