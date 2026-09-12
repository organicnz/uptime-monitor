import {
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

describe("resolveAndValidateUrl", () => {
  it("accepts an http URL with a public IP without DNS", async () => {
    const result = await resolveAndValidateUrl("http://8.8.8.8/health");
    expect(result).toEqual({
      safeUrl: "http://8.8.8.8/health",
      resolvedIp: "8.8.8.8",
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
