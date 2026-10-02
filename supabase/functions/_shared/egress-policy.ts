/**
 * Egress policy shared by both runtimes, exactly like `senders.ts`.
 *
 * - `lib/security.ts` (Next.js) validates with `ipaddr.js` + `node:dns`
 * - `./egress.ts` (Supabase Edge) validates with the hand-rolled classifier here
 *
 * Two independent implementations is how guards drift, so the pieces that are
 * pure data/pure functions live here and both sides import them: the blocked
 * hostname suffixes are one list, and the redirect planner is one function.
 * `__tests__/lib/egress-policy.test.ts` asserts the classifier is never weaker
 * than `ipaddr.js`, so the edge runtime cannot silently under-block.
 *
 * Constraints: no `node:*`, no `Deno.*`, no `process.env`, no dependencies.
 */

/** Hostnames that are never a legitimate notification destination. */
export const BLOCKED_HOSTNAME_SUFFIXES = [
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  "metadata.google.internal",
] as const;

/** True when the hostname is on the suffix/metadata blocklist. */
export function isBlockedHostname(hostname: string): boolean {
  if (!hostname) return false;
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAME_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(suffix),
  );
}

const BLOCKED_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const BLOCKED_V6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["::", 96],
  ["::1", 128],
  ["100::", 64],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["fec0::", 10],
  ["fe80::", 10],
  ["fc00::", 7],
  ["ff00::", 8],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["3fff::", 20],
];

function v4ToOctets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

/** Expands an IPv6 literal to its 8 sixteen-bit groups. Fail-closed on junk. */
function v6ToGroups(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0];
  if (!text.includes(":")) return null;

  // Embedded dotted-quad (`::ffff:127.0.0.1`) becomes two hex groups.
  const dotted = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = v4ToOctets(dotted[1]);
    if (octets === null) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    text = text.slice(0, text.length - dotted[1].length) + `${hi}:${lo}`;
  }

  const doubleColon = text.indexOf("::");
  if (doubleColon !== -1 && doubleColon !== text.lastIndexOf("::")) return null;

  const parseGroups = (raw: string): number[] | null => {
    if (raw === "") return [];
    const out: number[] = [];
    for (const group of raw.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };

  let head: number[] | null;
  let tail: number[] | null;
  if (doubleColon === -1) {
    head = parseGroups(text);
    tail = [];
  } else {
    head = parseGroups(text.slice(0, doubleColon));
    tail = parseGroups(text.slice(doubleColon + 2));
  }
  if (head === null || tail === null) return null;

  const zeros = 8 - head.length - tail.length;
  if (zeros < 0) return null;

  const groups = [...head, ...new Array<number>(zeros).fill(0), ...tail];
  return groups.length === 8 ? groups : null;
}

function matchesCidr(
  groups: number[],
  baseGroups: number[],
  bits: number,
): boolean {
  let remaining = bits;
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const take = Math.min(16, remaining);
    const mask = take === 0 ? 0 : (0xffff << (16 - take)) & 0xffff;
    if ((groups[i] & mask) !== (baseGroups[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

function octetsToValue(octets: number[]): number {
  return (
    (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0
  );
}

function isBlockedV4(address: string): boolean {
  const octets = v4ToOctets(address);
  // Unparseable counts as blocked: the caller asks "is this public?" and an
  // address we cannot understand must never be answered with "yes".
  if (octets === null) return true;

  const value = octetsToValue(octets);
  for (const [base, bits] of BLOCKED_V4_CIDRS) {
    const baseOctets = v4ToOctets(base);
    if (baseOctets === null) continue;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    if ((value & mask) >>> 0 === (octetsToValue(baseOctets) & mask) >>> 0) {
      return true;
    }
  }
  return false;
}

/**
 * True when the address is a routable public address.
 *
 * Everything else — private, loopback, link-local, multicast, documentation,
 * metadata, NAT64, and any address we cannot parse — reports `false`, so the
 * caller fails closed.
 */
export function isPublicAddress(address: string): boolean {
  if (!address) return false;
  // `new URL().hostname` returns IPv6 literals bracketed (`[::1]`).
  const normalized =
    address.startsWith("[") && address.endsWith("]")
      ? address.slice(1, -1)
      : address;
  if (!normalized) return false;

  if (normalized.includes(":")) {
    const groups = v6ToGroups(normalized);
    if (groups === null) return false;

    // IPv4-mapped (::ffff:a.b.c.d or ::ffff:7f00:1): the stack connects to
    // the embedded IPv4 address, so that address is what must be classified.
    const isIpv4Mapped =
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0xffff;
    if (isIpv4Mapped) {
      const octets = [
        (groups[6] >> 8) & 255,
        groups[6] & 255,
        (groups[7] >> 8) & 255,
        groups[7] & 255,
      ];
      return !isBlockedV4(octets.join("."));
    }

    for (const [base, bits] of BLOCKED_V6_CIDRS) {
      const baseGroups = v6ToGroups(base);
      if (baseGroups === null) continue;
      if (matchesCidr(groups, baseGroups, bits)) return false;
    }
    return true;
  }
  return !isBlockedV4(normalized);
}

export const SSRF_MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RedirectStep {
  /** Absolute URL of the next hop, resolved against the current one. */
  url: string;
  /** Method to use for the next hop. */
  method: string;
  /** True when the hop crosses origins and request headers must be dropped. */
  crossOrigin: boolean;
}

/**
 * Decides how to follow a redirect, with each hop treated as a new request
 * that the egress policy must re-validate.
 *
 * Returns `null` when the response is not a followable redirect (including a
 * missing or unparseable `Location`), so the caller surfaces it as-is.
 */
export function planRedirect(params: {
  status: number;
  location: string | null;
  currentUrl: string;
  method: string;
  initialOrigin: string;
}): RedirectStep | null {
  const { status, location, currentUrl, method, initialOrigin } = params;
  if (!location || !REDIRECT_STATUSES.has(status)) return null;

  let url: string;
  try {
    url = new URL(location, currentUrl).toString();
  } catch {
    return null;
  }

  const crossOrigin = new URL(url).origin !== initialOrigin;
  if (crossOrigin) {
    return { url, method: "GET", crossOrigin: true };
  }

  const upperMethod = method.toUpperCase();
  if (
    status === 303 ||
    ((status === 301 || status === 302) && upperMethod === "POST")
  ) {
    return { url, method: "GET", crossOrigin: false };
  }
  return { url, method: upperMethod, crossOrigin: false };
}
