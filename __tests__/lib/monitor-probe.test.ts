import { describe, expect, it } from "bun:test";

import type { ProbeJob, ProbeResult } from "@/lib/probe";
import type { Monitor } from "@/types/application";

/**
 * The batched check orchestration.
 *
 * The probe is injected as a fake runner: what matters is that the whole
 * batch is sent in one request, that a redirect produces another round with
 * the right request, and that every hop is validated against the SSRF
 * policy before it is sent. The probe binary's own behaviour is covered in
 * `probe.test.ts`.
 *
 * The monitors use public IP literals as their URLs, so the real policy
 * layer accepts them without a DNS lookup and the test stays offline.
 */

const PUBLIC_IP = "93.184.216.34";

/** The batches the orchestrator asked the probe to run. */
let batches: ProbeJob[][] = [];
/**
 * The results the fake probe returns, keyed by job id. Each id holds a list
 * of results, one per round; the last one is repeated once the list runs
 * out, so a fixture can describe "redirect, then succeed" or "always
 * redirect".
 */
let canned: Map<string, ProbeResult[]> = new Map();

const fakeRunner = async (jobs: ProbeJob[]) => {
  batches.push(jobs);
  const results = new Map<string, ProbeResult>();
  for (const job of jobs) {
    const list = canned.get(job.id);
    if (!list || list.length === 0) continue;
    const result = list.length > 1 ? list.shift()! : list[0];
    results.set(job.id, result);
  }
  return results;
};

const { planMonitorChecks } = await import("@/lib/monitor-checker");

function monitor(id: string, overrides: Partial<Monitor> = {}): Monitor {
  return {
    id,
    name: `monitor-${id}`,
    type: "http",
    url: `https://${PUBLIC_IP}/`,
    active: true,
    ...overrides,
  } as Monitor;
}

function httpResult(
  id: string,
  overrides: Partial<ProbeResult> = {},
): ProbeResult {
  return {
    id,
    ok: true,
    statusCode: 200,
    statusText: "OK",
    pingMs: 12,
    headers: { server: "testserver" },
    ...overrides,
  };
}

describe("batched monitor checks", () => {
  it("sends the whole batch to one probe process", async () => {
    batches = [];
    canned = new Map(["a", "b", "c"].map((id) => [id, [httpResult(id)]]));

    const monitors = ["a", "b", "c"].map((id) => monitor(id));
    const results = await planMonitorChecks(monitors, undefined, fakeRunner);

    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(3);
    expect(results.get("a")?.status).toBe(1);
    expect(results.get("c")?.ping).toBe(12);
  });

  it("pins every job to the validated address and keeps the hostname", async () => {
    batches = [];
    canned = new Map([["a", [httpResult("a")]]]);

    await planMonitorChecks([monitor("a")], undefined, fakeRunner);

    const job = batches[0][0];
    expect(job.kind).toBe("http");
    if (job.kind !== "http") throw new Error("expected an http job");
    expect(job.resolvedIp).toBe(PUBLIC_IP);
    expect(job.url).toBe(`https://${PUBLIC_IP}/`);
  });

  it("sends the User-Agent and the monitor's own headers", async () => {
    batches = [];
    canned = new Map([["a", [httpResult("a")]]]);

    await planMonitorChecks(
      [monitor("a", { headers: { "x-probe": "yes" } })],
      undefined,
      fakeRunner,
    );

    const job = batches[0][0];
    if (job.kind !== "http") throw new Error("expected an http job");
    expect(job.headers["User-Agent"]).toBe("Uptime-Monitor/1.0");
    expect(job.headers["x-probe"]).toBe("yes");
  });

  it("decides a missing URL without asking the probe", async () => {
    batches = [];
    canned = new Map();

    const results = await planMonitorChecks(
      [monitor("a", { url: undefined })],
      undefined,
      fakeRunner,
    );

    expect(batches.length).toBe(0);
    expect(results.get("a")?.msg).toBe("Missing URL");
    expect(results.get("a")?.status).toBe(0);
  });

  it("maps a keyword monitor to a body-reading job", async () => {
    batches = [];
    canned = new Map([["a", [httpResult("a")]]]);

    await planMonitorChecks(
      [
        monitor("a", {
          type: "keyword",
          keyword: "needle",
        }),
      ],
      undefined,
      fakeRunner,
    );

    const job = batches[0][0];
    if (job.kind !== "http") throw new Error("expected an http job");
    expect(job.readBody).toBe(true);
  });

  it("maps a TCP monitor to a TCP job", async () => {
    batches = [];
    canned = new Map([
      ["a", [{ id: "a", ok: true, pingMs: 3 } satisfies ProbeResult]],
    ]);

    const results = await planMonitorChecks(
      [
        monitor("a", {
          type: "tcp",
          hostname: PUBLIC_IP,
          port: 443,
          url: undefined,
        }),
      ],
      undefined,
      fakeRunner,
    );

    const job = batches[0][0];
    expect(job.kind).toBe("tcp");
    expect(results.get("a")?.msg).toBe("Connection successful");
    expect(results.get("a")?.status).toBe(1);
  });

  it("reports a timeout the way the in-process path does", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          {
            id: "a",
            ok: false,
            pingMs: 48_000,
            error: "timeout",
            errorKind: "timeout",
          } satisfies ProbeResult,
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a", { timeout: 48 })],
      undefined,
      fakeRunner,
    );

    expect(results.get("a")?.msg).toBe("Timeout after 48s");
    expect(results.get("a")?.status).toBe(0);
  });

  it("reports a redirect it cannot follow", async () => {
    // A location the URL parser rejects is not a redirect to follow, and
    // trying anyway would send the request somewhere unvetted.
    batches = [];
    canned = new Map([
      ["a", [httpResult("a", { statusCode: 302, location: "http://" })]],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );

    expect(results.get("a")?.msg).toBe("Invalid redirect location");
    expect(results.get("a")?.status).toBe(0);
  });

  it("follows a 303 as a GET without the body", async () => {
    // A 303 says the next request is a GET, whatever the first one was.
    // The follow-up has to be sent the same way the fetch path sends it,
    // or the two paths disagree about what the monitor saw.
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", { statusCode: 303, location: "/next" }),
          httpResult("a", { statusCode: 200, statusText: "OK" }),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a", { method: "POST", body: "payload" })],
      undefined,
      fakeRunner,
    );

    expect(results.get("a")?.status).toBe(1);
    const second = batches[1]?.[0];
    expect(second).toMatchObject({ method: "GET" });
    expect(second && "body" in second ? second.body : null).toBeNull();
  });

  it("hands the work back when the probe cannot be used", async () => {
    // The probe is an accelerator. When it is not there, the result is
    // simply absent, and the caller does the work in-process instead.
    batches = [];
    canned = new Map();
    const unavailable = async () => null;

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      unavailable,
    );

    expect(results.get("a")).toBeUndefined();
  });

  it("reports a connection failure with the probe's own message", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          {
            id: "a",
            ok: false,
            pingMs: 12,
            error: "connection refused",
            errorKind: "connect",
          } satisfies ProbeResult,
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );
    expect(results.get("a")?.msg).toBe("connection refused");
  });

  it("plans a TCP check as a job for the probe", async () => {
    batches = [];
    canned = new Map();

    const results = await planMonitorChecks(
      [monitor("a", { type: "tcp", hostname: PUBLIC_IP, port: 8443 })],
      undefined,
      fakeRunner,
    );

    // The probe is asked to open the port, and the address it is given is
    // the one the policy layer resolved.
    expect(batches[0]?.[0]).toMatchObject({
      kind: "tcp",
      id: "a",
      host: PUBLIC_IP,
      port: 8443,
    });
    expect(results.get("a")?.status).toBe(0);
  });

  it("reports a TCP monitor with no hostname", async () => {
    batches = [];
    canned = new Map();

    const results = await planMonitorChecks(
      [monitor("a", { type: "tcp" })],
      undefined,
      fakeRunner,
    );

    expect(results.get("a")?.msg).toBe("Missing hostname");
  });

  it("reports a blocked TCP host as blocked", async () => {
    batches = [];
    canned = new Map();
    const blocked = {
      resolveHost: async () => {
        throw new Error("Target is a private address");
      },
      resolveUrl: async (url: string) => ({
        safeUrl: url,
        resolvedIp: PUBLIC_IP,
        hostname: new URL(url).hostname,
      }),
      fetch: async () => new Response("", { status: 200 }),
    };

    const results = await planMonitorChecks(
      [monitor("a", { type: "tcp", hostname: "10.0.0.1" })],
      undefined,
      fakeRunner,
      blocked,
    );

    expect(results.get("a")?.msg).toContain("SSRF Blocked");
    expect(batches).toHaveLength(0);
  });

  it("runs a ping check in process rather than in the probe", async () => {
    // A ping is a resolver call the policy layer already makes, and a
    // separate process would not make it any faster.
    batches = [];
    canned = new Map();

    await planMonitorChecks(
      [monitor("a", { type: "ping", hostname: PUBLIC_IP })],
      undefined,
      fakeRunner,
    );

    expect(batches).toHaveLength(0);
  });

  it("runs a DNS check in process rather than in the probe", async () => {
    batches = [];
    canned = new Map();

    await planMonitorChecks(
      [monitor("a", { type: "dns", hostname: "example.com" })],
      undefined,
      fakeRunner,
    );

    expect(batches).toHaveLength(0);
  });

  it("interprets the response exactly as the in-process path does", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", {
            statusCode: 403,
            statusText: "Forbidden",
            headers: { server: "cloudflare" },
          }),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );
    expect(results.get("a")?.status).toBe(0);
    expect(results.get("a")?.msg).toBe(
      "403 - Forbidden (Cloudflare detected - try whitelisting monitor IP)",
    );
  });

  it("inverts the result for an upside-down monitor", async () => {
    batches = [];
    canned = new Map([["a", [httpResult("a")]]]);

    const results = await planMonitorChecks(
      [monitor("a", { upside_down: true })],
      undefined,
      fakeRunner,
    );
    expect(results.get("a")?.status).toBe(0);
  });
});

describe("redirects", () => {
  it("follows a redirect in a second round", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", {
            statusCode: 302,
            statusText: "Found",
            location: `https://${PUBLIC_IP}/moved`,
          }),
          httpResult("a"),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );

    expect(batches.length).toBe(2);
    expect(batches[0].length).toBe(1);
    expect(batches[1].length).toBe(1);
    const second = batches[1][0];
    if (second.kind !== "http") throw new Error("expected an http job");
    expect(second.url).toBe(`https://${PUBLIC_IP}/moved`);
    expect(results.get("a")?.status).toBe(1);
  });

  it("does not follow a redirect the probe did not report a location for", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", {
            statusCode: 302,
            statusText: "Found",
            location: undefined,
          }),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );

    expect(batches.length).toBe(1);
    expect(results.get("a")?.status).toBe(0);
  });

  it("stops after too many redirects", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", {
            statusCode: 302,
            statusText: "Found",
            location: `https://${PUBLIC_IP}/loop`,
          }),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );

    // Five redirects are followed; the sixth is refused.
    expect(batches.length).toBe(6);
    expect(results.get("a")?.msg).toBe("Too many redirects");
  });

  it("validates the redirect target against the SSRF policy", async () => {
    batches = [];
    canned = new Map([
      [
        "a",
        [
          httpResult("a", {
            statusCode: 302,
            statusText: "Found",
            // A loopback address must never be requested.
            location: "http://127.0.0.1:22/",
          }),
        ],
      ],
    ]);

    const results = await planMonitorChecks(
      [monitor("a")],
      undefined,
      fakeRunner,
    );

    expect(batches.length).toBe(1);
    expect(results.get("a")?.msg).toContain("SSRF Blocked");
    expect(results.get("a")?.status).toBe(0);
  });
});
