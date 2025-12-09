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

/**
 * Validate and sanitize URL to prevent SSRF
 */
export function isValidMonitorUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // Block localhost and private IPs
    const hostname = parsed.hostname.toLowerCase();
    const blockedPatterns = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "::1",
      "10.",
      "172.16.",
      "172.17.",
      "172.18.",
      "172.19.",
      "172.20.",
      "172.21.",
      "172.22.",
      "172.23.",
      "172.24.",
      "172.25.",
      "172.26.",
      "172.27.",
      "172.28.",
      "172.29.",
      "172.30.",
      "172.31.",
      "192.168.",
      "169.254.",
      ".local",
      ".internal",
    ];

    for (const pattern of blockedPatterns) {
      if (hostname.startsWith(pattern) || hostname.endsWith(pattern)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
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
