import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Still do comparison to maintain constant time
    timingSafeEqual(bufA, bufA);
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

const BLOCKED_HOSTNAME_SUFFIXES = [".local", ".internal"];

/**
 * Validates whether an IP address is safe to connect to.
 * Blocks private, loopback, link-local, multicast, and unspecified IPs.
 */
function isSafeIp(ipString: string): boolean {
  try {
    const addr = ipaddr.parse(ipString);
    const range = addr.range();

    // Allow public IPs (unicast). ipaddr.js classifies public as "unicast".
    // Some versions classify it differently, but generally private/loopback
    // are explicitly named.
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
    return true;
  } catch {
    // If we can't parse it as an IP, assume it's unsafe (fail closed)
    return false;
  }
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
    if (lowerHostname.endsWith(suffix)) {
      throw new Error(`Blocked domain suffix: ${suffix}`);
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
    const lookupResult = await dns.lookup(hostname, { all: false });
    const resolvedIp = lookupResult.address;

    if (!isSafeIp(resolvedIp)) {
      throw new Error(
        `Resolved IP (${resolvedIp}) is blocked (private/loopback range)`,
      );
    }

    return resolvedIp;
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

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid protocol. Only HTTP and HTTPS are allowed.");
    }

    const resolvedIp = await resolveAndValidateHost(parsed.hostname);

    // We return the resolved IP so the caller can use it for the actual connection
    // to strictly prevent the time-of-check to time-of-use (TOCTOU) DNS Rebinding race.
    return { safeUrl: url, resolvedIp };
  } catch (error: unknown) {
    throw new Error(`URL Validation failed: ${(error as Error).message}`);
  }
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
