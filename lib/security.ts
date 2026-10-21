import ipaddr from "ipaddr.js";

import { BLOCKED_HOSTNAME_SUFFIXES } from "../supabase/functions/_shared/egress-policy";

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Sanitize user input to prevent XSS.
 *
 * `Bun.escapeHTML` is the runtime's own HTML escaper: it applies the HTML
 * serialization algorithm, so `&`, `<`, `>`, `"` and `'` come out as
 * `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&#x27;` — byte for byte what the
 * hand-rolled chain of replacements produced, without the five passes over
 * the string and the two places a hand-written escaper can get the entity
 * order wrong (an `&` escaped after its neighbours, for instance, would
 * double-escape them).
 */
export function sanitizeHtml(input: string): string {
  return Bun.escapeHTML(input);
}

/**
 * Hostnames that are never a legitimate destination. One list, shared with the
 * Supabase Edge runtime via _shared/egress-policy.ts, so the two runtimes
 * cannot drift apart.
 */
export const blockedHostnameSuffixes: readonly string[] =
  BLOCKED_HOSTNAME_SUFFIXES;

/**
 * Validates whether an IP address is safe to connect to.
 * Blocks private, loopback, link-local, multicast, and unspecified IPs.
 * Automatically unwraps IPv4-mapped IPv6 addresses.
 *
 * Exported for `__tests__/lib/egress-policy.test.ts`, which uses it as the
 * oracle proving the edge runtime's hand-rolled classifier is never weaker
 * than `ipaddr.js`.
 */
export function isSafeIp(ipString: string): boolean {
  try {
    let addr = ipaddr.parse(ipString);

    // If it's an IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1), unwrap it to IPv4
    if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
      addr = (addr as ipaddr.IPv6).toIPv4Address();
    }

    const range = addr.range();

    const blockedRanges = [
      "unspecified",
      "broadcast",
      "multicast",
      "linkLocal",
      "loopback",
      "private",
      "carrierGradeNat",
      "reserved",
      "rfc6052",
      "rfc6145",
      "uniqueLocal", // IPv6 ULA
    ];

    if (blockedRanges.includes(range)) {
      return false;
    }

    // Explicitly block cloud instance metadata addresses and 0.0.0.0/8
    const rawIp = addr.toString();
    if (
      rawIp === "169.254.169.254" ||
      rawIp === "fd00:ec2::254" ||
      rawIp.startsWith("0.")
    ) {
      return false;
    }

    return true;
  } catch {
    // If we can't parse it as an IP, assume it's unsafe (fail closed)
    return false;
  }
}

/**
 * Formats a host or IP for use in URLs (e.g., wraps IPv6 addresses in brackets).
 */
export function formatHostForUrl(host: string): string {
  if (!host) return "";
  if (host.includes(":") && !host.startsWith("[") && !host.endsWith("]")) {
    return `[${host}]`;
  }
  return host;
}

/**
 * Every address a hostname resolves to, IPv4 first.
 *
 * Both families are queried because a host can answer with a public A record
 * and a private AAAA record, and a host that does either is not a legitimate
 * destination. Bun's resolver reports "no records of this family" as
 * `DNS_ENOTFOUND`, so a missing AAAA record is not an error — the IPv4
 * answers still stand.
 */
async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const addresses: string[] = [];

  for (const family of [4, 6] as const) {
    try {
      const results = await Bun.dns.lookup(hostname, { family });
      for (const result of results) {
        addresses.push(result.address);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (family === 6 && code === "DNS_ENOTFOUND") {
        continue;
      }
      throw error;
    }
  }

  return addresses;
}

/**
 * Pre-flight resolve and validate a hostname to prevent DNS rebinding attacks.
 * It resolves the domain to an IP and validates the IP.
 * @returns {Promise<string>} The resolved, safe IP address. Throws if unsafe.
 */
export async function resolveAndValidateHost(
  hostname: string,
): Promise<string> {
  if (!hostname || typeof hostname !== "string") {
    throw new Error("Invalid hostname");
  }

  const lowerHostname = hostname.toLowerCase();
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (lowerHostname === suffix || lowerHostname.endsWith(suffix)) {
      throw new Error(`Blocked domain suffix or host: ${suffix}`);
    }
  }

  // If it's already an IP address, just validate it directly
  if (ipaddr.isValid(hostname)) {
    if (!isSafeIp(hostname)) {
      throw new Error("Target IP is blocked (private/loopback range)");
    }
    return hostname;
  }

  // If it's a domain name, resolve it first to prevent DNS rebinding.
  // We prefer IPv4 but will accept IPv6.
  try {
    const lookupResults = await resolveAllAddresses(hostname);
    if (lookupResults.length === 0) {
      throw new Error("DNS Resolution returned no addresses");
    }

    for (const address of lookupResults) {
      if (!isSafeIp(address)) {
        throw new Error(
          `Resolved IP (${address}) is blocked (private/loopback range)`,
        );
      }
    }

    return lookupResults[0];
  } catch (error: unknown) {
    throw new Error(`DNS Resolution failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * Pre-flight validation of a full URL.
 * Extends resolveAndValidateHost to also check protocols.
 */
export async function resolveAndValidateUrl(
  url: string,
): Promise<{ safeUrl: string; resolvedIp: string; hostname: string }> {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid protocol. Only HTTP and HTTPS are allowed.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("URLs with embedded credentials are not allowed");
    }

    const resolvedIp = await resolveAndValidateHost(parsed.hostname);

    return { safeUrl: url, resolvedIp, hostname: parsed.hostname };
  } catch (error: unknown) {
    throw new Error(`URL Validation failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * Build a request target that is pinned to the already-validated IP.
 *
 * Connecting to the IP rather than the hostname is what defeats DNS
 * rebinding: a second DNS answer cannot change where the socket goes. The
 * original hostname survives in the two places the far end needs it — the
 * `Host` header, and the TLS server name (SNI), which is also the name the
 * certificate is validated against.
 */
function buildPinnedRequest(
  url: string,
  hostname: string,
  resolvedIp: string,
  headers: Headers,
): { url: string; headers: Headers; tls?: { servername: string } } {
  // The hostname is already the literal target, so there is nothing to pin.
  if (ipaddr.isValid(hostname)) {
    return { url, headers };
  }

  const pinned = new URL(url);
  pinned.hostname = resolvedIp.includes(":") ? `[${resolvedIp}]` : resolvedIp;

  const pinnedHeaders = new Headers(headers);
  // The port stays in the Host header exactly as the caller wrote it.
  pinnedHeaders.set("host", new URL(url).host);

  return {
    url: pinned.toString(),
    headers: pinnedHeaders,
    tls: { servername: hostname },
  };
}

export async function fetchWithSsrfProtection(
  initialUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  const initialOrigin = new URL(initialUrl).origin;
  let currentUrl = initialUrl;
  let method = init.method || "GET";
  let body = init.body;
  let headers = new Headers(init.headers);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const { resolvedIp, hostname } = await resolveAndValidateUrl(currentUrl);
    const pinned = buildPinnedRequest(
      currentUrl,
      hostname,
      resolvedIp,
      headers,
    );

    // Bun's `fetch` accepts a `tls` option that overrides the TLS server
    // name (SNI) — and with it, the name the server certificate is
    // validated against. `bun-types` declares it on `RequestInit`, so it
    // needs no cast and no local declaration.
    const response = await fetch(pinned.url, {
      ...init,
      headers: pinned.headers,
      method,
      body,
      redirect: "manual",
      ...(pinned.tls && { tls: pinned.tls }),
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    if (redirectCount === maxRedirects) {
      throw new Error("Too many redirects");
    }

    const nextUrl = new URL(location, currentUrl).toString();
    const nextOrigin = new URL(nextUrl).origin;
    if (nextOrigin !== initialOrigin) {
      headers = new Headers();
      method = "GET";
      body = undefined;
    } else if (
      response.status === 303 ||
      ([301, 302].includes(response.status) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
    }
    currentUrl = nextUrl;
  }

  throw new Error("Too many redirects");
}

/**
 * Generate a cryptographically secure random string.
 *
 * The alphabet has 62 characters, which does not divide 256, so a plain
 * `byte % 62` would make the first eight characters of the alphabet about
 * 25% more likely than the rest. Rejection sampling removes that: a byte
 * that falls in the incomplete final block is discarded and redrawn, so
 * every character is drawn with the same probability.
 */
export function generateSecureToken(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // The largest multiple of the alphabet size that fits in a byte. Bytes at
  // or above this are the biased tail and are thrown away.
  const limit = 256 - (256 % chars.length);

  const out: string[] = [];
  while (out.length < length) {
    // One oversized draw: the surplus is what the rejection loop consumes.
    const bytes = new Uint8Array(length - out.length + 8);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(chars[byte % chars.length]);
      if (out.length === length) break;
    }
  }

  return out.join("");
}
