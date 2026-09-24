import { timingSafeEqual } from "crypto";
import { Agent } from "undici";
import type { LookupFunction } from "node:net";

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

import * as dns from "dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  "metadata.google.internal",
];

/**
 * Validates whether an IP address is safe to connect to.
 * Blocks private, loopback, link-local, multicast, and unspecified IPs.
 * Automatically unwraps IPv4-mapped IPv6 addresses.
 */
function isSafeIp(ipString: string): boolean {
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
    const lookupResults = await dns.lookup(hostname, { all: true });
    if (lookupResults.length === 0) {
      throw new Error("DNS Resolution returned no addresses");
    }

    for (const result of lookupResults) {
      if (!isSafeIp(result.address)) {
        throw new Error(
          `Resolved IP (${result.address}) is blocked (private/loopback range)`,
        );
      }
    }

    return lookupResults[0].address;
  } catch (error: unknown) {
    throw new Error(`DNS Resolution failed: ${(error as Error).message}`);
  }
}

/**
 * Pre-flight validation of a full URL.
 * Extends resolveAndValidateHost to also check protocols.
 */
export async function resolveAndValidateUrl(
  url: string,
): Promise<{ safeUrl: string; resolvedIp: string }> {
  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid protocol. Only HTTP and HTTPS are allowed.");
    }
    if (parsed.username || parsed.password) {
      throw new Error("URLs with embedded credentials are not allowed");
    }

    const resolvedIp = await resolveAndValidateHost(parsed.hostname);

    return { safeUrl: url, resolvedIp };
  } catch (error: unknown) {
    throw new Error(`URL Validation failed: ${(error as Error).message}`);
  }
}

const pinnedAgents = new Map<string, Agent>();

function getPinnedAgent(
  hostname: string,
  resolvedIp: string,
): Agent | undefined {
  if (typeof process === "undefined") {
    throw new Error("DNS pinning is unavailable in this runtime");
  }
  if ("bun" in process.versions) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DNS pinning requires the Node.js runtime");
    }
    return undefined;
  }
  if (ipaddr.isValid(hostname)) {
    return undefined;
  }

  const key = `${hostname}:${resolvedIp}`;
  const existing = pinnedAgents.get(key);
  if (existing) return existing;

  const family = resolvedIp.includes(":") ? 6 : 4;
  const lookup: LookupFunction = (_host, options, callback) => {
    if (options.all) {
      callback(null, [{ address: resolvedIp, family }]);
      return;
    }
    callback(null, resolvedIp, family);
  };
  const agent = new Agent({
    connect: {
      lookup,
      servername: hostname,
    },
  });
  if (pinnedAgents.size >= 100) {
    const oldestKey = pinnedAgents.keys().next().value;
    if (oldestKey) {
      const oldestAgent = pinnedAgents.get(oldestKey);
      pinnedAgents.delete(oldestKey);
      void oldestAgent?.close();
    }
  }
  pinnedAgents.set(key, agent);
  return agent;
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
    const { resolvedIp } = await resolveAndValidateUrl(currentUrl);
    const dispatcher = getPinnedAgent(new URL(currentUrl).hostname, resolvedIp);

    const response = await fetch(currentUrl, {
      ...init,
      headers,
      method,
      body,
      redirect: "manual",
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit);

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
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}
