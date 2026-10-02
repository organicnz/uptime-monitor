/**
 * Egress guard for the edge runtime.
 *
 * `lib/security.ts` resolves and validates with `node:dns` + `ipaddr.js`,
 * which Deno has no equivalent for. This is the Deno-native equivalent.
 *
 * What it guarantees:
 * - the hostname is checked against the shared blocklist before any DNS
 * - if ANY resolved record is not public the hostname is rejected outright
 *   (not merely filtered), so a public+private DNS answer cannot slip through
 * - redirects are never followed by `fetch`; each hop is re-resolved and
 *   re-validated, bounded by SSRF_MAX_REDIRECTS
 * - unparseable input fails closed
 *
 * What it cannot guarantee: IP pinning. The Node side pins the socket to the
 * validated address via a custom dispatcher (`getPinnedAgent`); Deno exposes
 * no equivalent for `fetch`, so there is a resolve-then-connect window here.
 * The strict any-record rule above is the mitigation, not a substitute — if
 * Deno ever grows a connect-time address option, pin here too.
 */

import {
  SSRF_MAX_REDIRECTS,
  isBlockedHostname,
  isPublicAddress,
  planRedirect,
} from "./egress-policy.ts";

export class BlockedUrlError extends Error {
  constructor(reason: string) {
    super(`URL blocked by SSRF filter: ${reason}`);
    this.name = "BlockedUrlError";
  }
}

/** True when the host is an IP literal rather than a name to resolve. */
function isIpLiteral(host: string): boolean {
  return host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Validates a hostname and returns its public addresses.
 *
 * Rejects the whole hostname as soon as one record is non-public, mirroring
 * `resolveAndValidateHost` in lib/security.ts.
 */
async function validatedAddressesFor(hostname: string): Promise<string[]> {
  if (isBlockedHostname(hostname)) {
    throw new BlockedUrlError(`blocked hostname suffix: ${hostname}`);
  }

  if (isIpLiteral(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new BlockedUrlError(`${hostname} is a private or reserved address`);
    }
    return [hostname];
  }

  const found: string[] = [];
  for (const family of ["A", "AAAA"] as const) {
    try {
      found.push(...(await Deno.resolveDns(hostname, family)));
    } catch {
      // No record of this family is not an error.
    }
  }

  if (found.length === 0) {
    throw new BlockedUrlError(`${hostname} did not resolve`);
  }

  for (const address of found) {
    if (!isPublicAddress(address)) {
      throw new BlockedUrlError(
        `${hostname} resolves to ${address}, not public`,
      );
    }
  }

  return found;
}

/** Resolves and validates a URL, returning it ready to fetch. */
async function validateUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BlockedUrlError(`invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new BlockedUrlError(`unsupported protocol ${parsed.protocol}`);
  }

  if (parsed.username || parsed.password) {
    throw new BlockedUrlError("credentials in URL are not allowed");
  }

  await validatedAddressesFor(parsed.hostname);
  return parsed;
}

/**
 * Returns a transport that only talks to validated public destinations.
 *
 * Throws `BlockedUrlError` for anything else, so the caller can report a
 * blocked URL as such rather than as a generic network failure.
 *
 * Redirects are followed manually with per-hop validation and are capped at
 * SSRF_MAX_REDIRECTS; exhausting the budget throws rather than returning the
 * last hop's response.
 */
export function createSsrfProtectedTransport(): (
  url: string,
  init: RequestInit,
) => Promise<Response> {
  return async (url, init) => {
    let initialOrigin = "";
    let currentUrl = url;
    let method = init.method ?? "GET";
    let body = init.body;
    let headers = new Headers(init.headers);

    for (let hop = 0; hop <= SSRF_MAX_REDIRECTS; hop++) {
      const parsed = await validateUrl(currentUrl);
      currentUrl = parsed.toString();
      if (hop === 0) initialOrigin = parsed.origin;

      const response = await fetch(currentUrl, {
        ...init,
        headers,
        method,
        body,
        redirect: "manual",
      });

      const step = planRedirect({
        status: response.status,
        location: response.headers.get("location"),
        currentUrl,
        method,
        initialOrigin,
      });

      if (!step) {
        return response;
      }

      // Release this hop's body before issuing the next request.
      if (response.body) await response.body.cancel().catch(() => {});

      if (hop === SSRF_MAX_REDIRECTS) {
        throw new BlockedUrlError("too many redirects");
      }

      if (step.crossOrigin) headers = new Headers();
      method = step.method;
      if (method === "GET") body = undefined;
      currentUrl = step.url;
    }

    throw new BlockedUrlError("too many redirects");
  };
}
