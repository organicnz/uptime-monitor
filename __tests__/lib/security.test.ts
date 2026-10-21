import { describe, expect, it } from "bun:test";

import {
  fetchWithSsrfProtection,
  formatHostForUrl,
  generateSecureToken,
  resolveAndValidateHost,
  resolveAndValidateUrl,
  sanitizeHtml,
  secureCompare,
} from "@/lib/security";

describe("secureCompare", () => {
  it("returns true for equal strings", () => {
    expect(secureCompare("secret-token", "secret-token")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(secureCompare("secret-token-a", "secret-token-b")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(secureCompare("short", "a-much-longer-string")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(secureCompare("", "")).toBe(true);
  });

  it("returns false for non-string inputs", () => {
    expect(secureCompare(undefined as unknown as string, "x")).toBe(false);
    expect(secureCompare("x", null as unknown as string)).toBe(false);
  });
});

describe("sanitizeHtml", () => {
  it("escapes angle brackets, quotes, and ampersands", () => {
    expect(sanitizeHtml("<script>steal(\"x\") & 'y'</script>")).toBe(
      "&lt;script&gt;steal(&quot;x&quot;) &amp; &#x27;y&#x27;&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(sanitizeHtml("API server is up")).toBe("API server is up");
  });

  it("handles empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });
});

describe("formatHostForUrl", () => {
  it("returns empty string for empty host", () => {
    expect(formatHostForUrl("")).toBe("");
  });

  it("leaves hostnames and IPv4 addresses untouched", () => {
    expect(formatHostForUrl("example.com")).toBe("example.com");
    expect(formatHostForUrl("8.8.8.8")).toBe("8.8.8.8");
  });

  it("wraps bare IPv6 addresses in brackets", () => {
    expect(formatHostForUrl("::1")).toBe("[::1]");
    expect(formatHostForUrl("2001:db8::1")).toBe("[2001:db8::1]");
  });

  it("leaves already-bracketed IPv6 addresses untouched", () => {
    expect(formatHostForUrl("[::1]")).toBe("[::1]");
  });
});

describe("generateSecureToken", () => {
  it("generates a 32-char token by default", () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("respects a custom length", () => {
    expect(generateSecureToken(16)).toHaveLength(16);
  });

  it("generates unique tokens", () => {
    expect(generateSecureToken()).not.toBe(generateSecureToken());
  });

  it("draws every character with the same probability", () => {
    // The alphabet has 62 characters, which does not divide 256. A plain
    // `byte % 62` therefore makes the first eight characters of the
    // alphabet about 25% more likely than the rest; rejection sampling is
    // what removes that. A million characters is enough for the biased
    // version to show a gap far outside the tolerance below.
    const sample = Array.from({ length: 1000 }, () =>
      generateSecureToken(1000),
    ).join("");
    const counts = new Map<string, number>();
    for (const character of sample) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }

    expect(counts.size).toBe(62);

    const frequencies = [...counts.values()];
    const lowest = Math.min(...frequencies);
    const highest = Math.max(...frequencies);

    // Uniform sampling puts the spread at a few percent; the biased
    // version puts it at 25%.
    expect(highest / lowest).toBeLessThan(1.1);
  });
});

describe("resolveAndValidateHost", () => {
  it("accepts a public IPv4 address without DNS", async () => {
    await expect(resolveAndValidateHost("8.8.8.8")).resolves.toBe("8.8.8.8");
  });

  it("rejects loopback addresses", async () => {
    await expect(resolveAndValidateHost("127.0.0.1")).rejects.toThrow();
  });

  it("rejects private ranges", async () => {
    await expect(resolveAndValidateHost("10.0.0.1")).rejects.toThrow();
    await expect(resolveAndValidateHost("192.168.1.1")).rejects.toThrow();
  });

  it("rejects cloud metadata addresses", async () => {
    await expect(resolveAndValidateHost("169.254.169.254")).rejects.toThrow();
  });

  it("rejects IPv4-mapped IPv6 loopback (no bypass)", async () => {
    await expect(resolveAndValidateHost("::ffff:127.0.0.1")).rejects.toThrow();
  });

  it("rejects blocked internal suffixes without DNS", async () => {
    await expect(resolveAndValidateHost("db.local")).rejects.toThrow();
    await expect(
      resolveAndValidateHost("metadata.google.internal"),
    ).rejects.toThrow();
  });

  it("rejects empty or non-string hostnames", async () => {
    await expect(resolveAndValidateHost("")).rejects.toThrow(
      "Invalid hostname",
    );
  });
});

describe("fetchWithSsrfProtection", () => {
  it("rejects a redirect to a blocked address", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
      })) as unknown as typeof fetch;

    try {
      await expect(
        fetchWithSsrfProtection("http://8.8.8.8/start"),
      ).rejects.toThrow("URL Validation failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("drops custom headers on a cross-origin redirect", async () => {
    const originalFetch = globalThis.fetch;
    const requests: RequestInit[] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      requests.push(init ?? {});
      if (requests.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://1.1.1.1/next" },
        });
      }
      return new Response("ok");
    }) as unknown as typeof fetch;

    try {
      await fetchWithSsrfProtection("http://8.8.8.8/start", {
        headers: { "X-Secret": "do-not-forward" },
      });
      expect(requests).toHaveLength(2);
      expect(new Headers(requests[1].headers).has("x-secret")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("resolveAndValidateUrl", () => {
  it("accepts an http URL with a public IP without DNS", async () => {
    const result = await resolveAndValidateUrl("http://8.8.8.8/health");
    expect(result).toEqual({
      safeUrl: "http://8.8.8.8/health",
      resolvedIp: "8.8.8.8",
      hostname: "8.8.8.8",
    });
  });

  it("rejects non-http protocols", async () => {
    await expect(resolveAndValidateUrl("ftp://8.8.8.8/x")).rejects.toThrow();
    await expect(resolveAndValidateUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects URLs pointing at loopback", async () => {
    await expect(resolveAndValidateUrl("http://127.0.0.1/")).rejects.toThrow();
  });

  it("rejects malformed URLs", async () => {
    await expect(resolveAndValidateUrl("not a url")).rejects.toThrow();
  });
});

/**
 * DNS pinning.
 *
 * The socket has to go to the address that was validated, otherwise a second
 * DNS answer can point the request at a private address. Bun's resolver is
 * stubbed so the tests never depend on the network.
 */
describe("DNS pinning", () => {
  type StubAnswers = { 4: string[]; 6: string[] };

  async function withStubbedDns(
    answers: StubAnswers,
    run: () => Promise<void>,
  ): Promise<void> {
    const original = Bun.dns.lookup;
    Bun.dns.lookup = (async (
      _hostname: string,
      options?: { family?: number },
    ) => {
      const family = options?.family === 6 ? 6 : 4;
      const resolved = answers[family];
      if (resolved.length === 0) {
        // Bun reports "no records of this family" as ENOTFOUND.
        const error = new Error("getaddrinfo ENOTFOUND") as Error & {
          code?: string;
        };
        error.code = "DNS_ENOTFOUND";
        throw error;
      }
      return resolved.map((address) => ({
        address,
        family,
        ttl: 0,
      }));
    }) as unknown as typeof Bun.dns.lookup;

    try {
      await run();
    } finally {
      Bun.dns.lookup = original;
    }
  }

  it("connects to the resolved IP, not to the hostname", async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested.push(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      );
      return new Response("ok");
    }) as unknown as typeof fetch;

    try {
      await withStubbedDns({ 4: ["93.184.216.34"], 6: [] }, async () => {
        await fetchWithSsrfProtection("https://example.com/health");
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requested).toEqual(["https://93.184.216.34/health"]);
  });

  it("keeps the hostname in the Host header and the TLS server name", async () => {
    const originalFetch = globalThis.fetch;
    const requests: {
      url: string;
      headers: Headers;
      tls?: { servername?: string };
    }[] = [];
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit & { tls?: { servername?: string } },
    ) => {
      requests.push({
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        headers: new Headers(init?.headers),
        tls: init?.tls,
      });
      return new Response("ok");
    }) as unknown as typeof fetch;

    try {
      await withStubbedDns({ 4: ["93.184.216.34"], 6: [] }, async () => {
        await fetchWithSsrfProtection("https://example.com:8443/health", {
          headers: { "X-Trace": "abc" },
        });
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://93.184.216.34:8443/health");
    expect(requests[0].headers.get("host")).toBe("example.com:8443");
    expect(requests[0].headers.get("x-trace")).toBe("abc");
    expect(requests[0].tls?.servername).toBe("example.com");
  });

  it("rejects a host that answers with a private address", async () => {
    await withStubbedDns(
      { 4: ["93.184.216.34"], 6: ["10.0.0.5"] },
      async () => {
        await expect(resolveAndValidateHost("rebind.example")).rejects.toThrow(
          "blocked",
        );
      },
    );
  });

  it("rejects a host whose only answer is a private address", async () => {
    await withStubbedDns({ 4: ["192.168.10.10"], 6: [] }, async () => {
      await expect(resolveAndValidateHost("rebind.example")).rejects.toThrow(
        "blocked",
      );
    });
  });
});
