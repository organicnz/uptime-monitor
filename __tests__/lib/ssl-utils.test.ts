import { describe, expect, it } from "bun:test";

import {
  checkSslCertificate,
  formatSslInfo,
  getSslDaysRemaining,
  getSslExpiryStatus,
  shouldWarnSslExpiry,
  SSL_DAYS_REMAINING_UNKNOWN,
  type SslDependencies,
} from "@/lib/ssl-utils";

/**
 * The certificate check has two paths, and the difference between them is
 * the point: crt.sh is a fixed endpoint that is part of the integration,
 * and the fallback reaches the user's own host, which has to go through
 * the SSRF filter. These tests tell the two apart.
 *
 * The calls are a port, so the fakes below are plain objects. Nothing here
 * mocks a module — `mock.module` in Bun is process-wide, and a test that
 * replaced one would silently change what every other test file sees.
 */

type Sent = { url: string; init: RequestInit };

function dependencies(
  options: {
    crt?: () => Promise<Response>;
    ssrf?: () => Promise<Response>;
    sent?: Sent[];
    ssrfSent?: Sent[];
  } = {},
): SslDependencies & { sent: Sent[]; ssrfSent: Sent[] } {
  const sent = options.sent ?? [];
  const ssrfSent = options.ssrfSent ?? [];

  return {
    sent,
    ssrfSent,
    fetch: async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return options.crt
        ? options.crt()
        : new Response(JSON.stringify([]), { status: 200 });
    },
    ssrfFetch: async (url: string, init?: RequestInit) => {
      ssrfSent.push({ url, init: init ?? {} });
      return options.ssrf ? options.ssrf() : new Response("", { status: 200 });
    },
  };
}

/** A certificate as crt.sh reports it. */
function cert(days: number) {
  const notAfter = new Date(Date.now() + days * 86_400_000);
  return {
    issuer_name: "Let's Encrypt",
    not_before: new Date(notBefore(notAfter)).toISOString(),
    not_after: notAfter.toISOString(),
    common_name: "example.com",
  };
}

function notBefore(notAfter: Date): number {
  return notAfter.getTime() - 90 * 86_400_000;
}

describe("checkSslCertificate", () => {
  it("refuses a URL that is not HTTPS", async () => {
    const deps = dependencies();

    const result = await checkSslCertificate("http://example.com", deps);

    expect(result).toEqual({
      success: false,
      info: null,
      error: "URL is not HTTPS",
    });
    expect(deps.sent).toHaveLength(0);
  });

  it("reads the certificate from crt.sh", async () => {
    const deps = dependencies({
      crt: async () =>
        new Response(JSON.stringify([cert(30)]), { status: 200 }),
    });

    const result = await checkSslCertificate("https://example.com", deps);

    expect(result.success).toBe(true);
    expect(result.info?.issuer).toBe("Let's Encrypt");
    expect(result.info?.subject).toBe("example.com");
    expect(result.info?.isValid).toBe(true);
    // The expiry is counted against "now", which moves between the two
    // calls, so the answer is a day either side of thirty.
    expect(result.info?.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(result.info?.daysRemaining).toBeLessThanOrEqual(30);
    expect(deps.sent[0]?.url).toContain("crt.sh");
  });

  it("takes the most recent certificate", async () => {
    const deps = dependencies({
      crt: async () =>
        new Response(JSON.stringify([cert(10), cert(60)]), { status: 200 }),
    });

    const result = await checkSslCertificate("https://example.com", deps);

    expect(result.info?.daysRemaining).toBeGreaterThanOrEqual(59);
    expect(result.info?.daysRemaining).toBeLessThanOrEqual(60);
  });

  it("falls back when crt.sh has nothing", async () => {
    const deps = dependencies({
      crt: async () => new Response("[]", { status: 200 }),
      ssrf: async () => new Response("", { status: 200 }),
    });

    const result = await checkSslCertificate("https://example.com", deps);

    expect(result.success).toBe(true);
    expect(result.info?.daysRemaining).toBe(SSL_DAYS_REMAINING_UNKNOWN);
    expect(result.info?.issuer).toBe("Unknown (fallback check)");
    expect(deps.ssrfSent).toHaveLength(1);
  });

  it("falls back when crt.sh fails", async () => {
    const deps = dependencies({
      crt: async () => {
        throw new Error("crt.sh is down");
      },
      ssrf: async () => new Response("", { status: 200 }),
    });

    const result = await checkSslCertificate("https://example.com", deps);

    expect(result.success).toBe(true);
    expect(deps.ssrfSent).toHaveLength(1);
  });

  it("sends the fallback through the SSRF-protected transport", async () => {
    // The fallback contacts the user's own host, so it must not be the
    // plain transport.
    const deps = dependencies({
      crt: async () => new Response("[]", { status: 200 }),
      ssrf: async () => new Response("", { status: 200 }),
    });

    await checkSslCertificate("https://example.com", deps);

    expect(deps.ssrfSent[0]?.url).toBe("https://example.com");
    expect(deps.ssrfSent[0]?.init.method).toBe("HEAD");
  });

  it("reports a host that will not answer", async () => {
    const deps = dependencies({
      crt: async () => new Response("[]", { status: 200 }),
      ssrf: async () => new Response("nope", { status: 503 }),
    });

    const result = await checkSslCertificate("https://example.com", deps);

    expect(result).toEqual({
      success: false,
      info: null,
      error: "HTTPS check failed: 503",
    });
  });

  it("reports a URL that cannot be parsed", async () => {
    const deps = dependencies();

    const result = await checkSslCertificate("not a url", deps);

    expect(result.success).toBe(false);
    expect(result.info).toBeNull();
    expect(result.error).toBeTruthy();
  });
});

describe("getSslDaysRemaining", () => {
  it("counts the days until a date", () => {
    const inTen = new Date(Date.now() + 10 * 86_400_000);

    // The count is taken against "now", which moves between the two calls,
    // so the answer is a day either side of ten.
    const days = getSslDaysRemaining(inTen);
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(10);
  });

  it("accepts a date string", () => {
    const inTen = new Date(Date.now() + 10 * 86_400_000).toISOString();

    const days = getSslDaysRemaining(inTen);
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(10);
  });

  it("is negative for a date in the past", () => {
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);

    expect(getSslDaysRemaining(lastWeek)).toBe(-7);
  });
});

describe("getSslExpiryStatus", () => {
  it("reports an unknown expiry as unknown", () => {
    expect(getSslExpiryStatus(SSL_DAYS_REMAINING_UNKNOWN)).toEqual({
      status: "unknown",
      label: "Unknown",
      color: "gray",
    });
  });

  it("reports a past expiry as expired", () => {
    expect(getSslExpiryStatus(-1).status).toBe("expired");
  });

  it("reports a future expiry as ok", () => {
    const status = getSslExpiryStatus(12);

    expect(status.status).toBe("ok");
    expect(status.label).toBe("12d remaining");
  });
});

describe("shouldWarnSslExpiry", () => {
  it("does not warn when the expiry is unknown", () => {
    expect(shouldWarnSslExpiry(SSL_DAYS_REMAINING_UNKNOWN)).toBe(false);
  });

  it("does not warn while the certificate is still valid", () => {
    expect(shouldWarnSslExpiry(10)).toBe(false);
  });

  it("warns once the certificate has expired", () => {
    expect(shouldWarnSslExpiry(-1)).toBe(true);
  });

  it("does not warn twice for the same expiry", () => {
    // The warning is for the crossing, not for every check after it.
    expect(shouldWarnSslExpiry(-1, -1)).toBe(false);
  });

  it("does not warn again while it stays expired", () => {
    expect(shouldWarnSslExpiry(-2, -1)).toBe(false);
  });

  it("warns when the certificate expires between two checks", () => {
    // The last check saw a valid certificate; this one sees an expired
    // one. That is the crossing, and it is worth a warning.
    expect(shouldWarnSslExpiry(-1, 0)).toBe(true);
    expect(shouldWarnSslExpiry(-1, 5)).toBe(true);
  });
});

describe("formatSslInfo", () => {
  it("renders the certificate for display", () => {
    const text = formatSslInfo({
      issuer: "Let's Encrypt",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-04-01T00:00:00.000Z",
      daysRemaining: 42,
      isValid: true,
      subject: "example.com",
    });

    expect(text).toContain("Subject: example.com");
    expect(text).toContain("Issuer: Let's Encrypt");
    expect(text).toContain("Days Remaining: 42");
  });

  it("says unknown rather than the sentinel number", () => {
    const text = formatSslInfo({
      issuer: "Unknown (fallback check)",
      validFrom: "",
      validTo: "",
      daysRemaining: SSL_DAYS_REMAINING_UNKNOWN,
      isValid: true,
      subject: "example.com",
    });

    expect(text).toContain("Days Remaining: Unknown");
  });
});
