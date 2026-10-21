import { join } from "bun:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  findProbeBinary,
  isProbeAvailable,
  type ProbeJob,
  runProbeBatch,
} from "@/lib/probe";

/**
 * The bridge to the Rust probe.
 *
 * These tests run the real binary against a real local server, because the
 * thing worth testing is the seam between two processes: the JSON contract,
 * the IP pinning, and the error classification.
 *
 * When the binary has not been built, the binary-backed tests are skipped
 * rather than failed: the probe is an optional accelerator, and the app is
 * expected to work without it.
 */

const probeAvailable = isProbeAvailable();

let server: Bun.Subprocess<"ignore", "pipe", "pipe">;
let port: number;

beforeAll(async () => {
  // The fixture server runs in its own process: the test suite preloads
  // happy-dom, which replaces the global `Response` with a DOM
  // implementation that a real HTTP server cannot serialize.
  server = Bun.spawn(
    ["bun", join(import.meta.dir, "probe-fixture-server.ts")],
    { stdout: "pipe", stderr: "pipe" },
  );

  const reader = server.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (port === undefined) {
    const { done, value } = await reader.read();
    if (done) throw new Error("the fixture server exited unexpectedly");
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/PORT=(\d+)/);
    if (match) port = Number(match[1]);
  }
});

afterAll(() => {
  server?.kill();
});

function httpJob(
  id: string,
  path: string,
  overrides: Partial<Extract<ProbeJob, { kind: "http" }>> = {},
): ProbeJob {
  return {
    kind: "http",
    id,
    url: `http://localhost:${port}${path}`,
    resolvedIp: "127.0.0.1",
    method: "GET",
    headers: { "user-agent": "Uptime-Monitor/1.0" },
    body: null,
    // Generous: the timeout is a safety net against a wedged probe, not
    // the time a local request is expected to take.
    timeoutMs: 30_000,
    readBody: false,
    maxBodyBytes: 65_536,
    ...overrides,
  };
}

describe("probe bridge", () => {
  it("finds the binary when it has been built", () => {
    if (!probeAvailable) return;
    expect(findProbeBinary()).not.toBeNull();
  });

  it("returns an empty map for an empty batch", async () => {
    const results = await runProbeBatch([]);
    expect(results?.size).toBe(0);
  });

  it("returns null when the binary is not available", async () => {
    // The bridge must degrade rather than throw: the caller falls back to
    // the in-process implementation. `PROBE_BINARY` names the binary
    // exactly, so pointing it at nothing disables the probe entirely.
    const original = Bun.env.PROBE_BINARY;
    Bun.env.PROBE_BINARY = "/nonexistent/probe-binary";
    try {
      const results = await runProbeBatch([httpJob("x", "/")]);
      expect(results).toBeNull();
    } finally {
      if (original === undefined) delete Bun.env.PROBE_BINARY;
      else Bun.env.PROBE_BINARY = original;
    }
  });
});

describe.skipIf(!probeAvailable)("probe binary", () => {
  it("answers a batch of HTTP and TCP jobs in one process", async () => {
    const results = await runProbeBatch([
      httpJob("ok", "/"),
      httpJob("body", "/keyword", { readBody: true }),
      httpJob("boom", "/boom"),
      { kind: "tcp", id: "tcp", host: "127.0.0.1", port, timeoutMs: 5_000 },
    ]);

    expect(results).not.toBeNull();
    const map = results!;

    const ok = map.get("ok");
    expect(ok?.ok).toBe(true);
    expect(ok?.statusCode).toBe(200);
    expect(ok?.statusText).toBe("OK");
    expect(ok?.headers?.["server"]).toBe("testserver");
    expect(ok?.pingMs).toBeGreaterThanOrEqual(0);

    // The body is only read when the job asks for it.
    const body = map.get("body");
    expect(body?.body).toContain("quick brown fox");

    // A 500 is still a completed request: "ok" is about the connection.
    const boom = map.get("boom");
    expect(boom?.ok).toBe(true);
    expect(boom?.statusCode).toBe(500);

    const tcp = map.get("tcp");
    expect(tcp?.ok).toBe(true);
  });

  it("keeps the hostname in the Host header while connecting to the pinned address", async () => {
    const results = await runProbeBatch([
      httpJob("host", "/echo-host", { readBody: true }),
    ]);
    const result = results?.get("host");

    // The request went to 127.0.0.1, but the far end saw the name.
    expect(result?.body).toBe(`localhost:${port}`);
  });

  it("does not follow redirects", async () => {
    const results = await runProbeBatch([httpJob("redirect", "/redirect")]);
    const result = results?.get("redirect");

    // The caller follows redirects itself, so that every hop is validated
    // against the SSRF policy before it is requested.
    expect(result?.statusCode).toBe(302);
    expect(result?.location).toBe("/final");
  });

  it("classifies a refused connection", async () => {
    const results = await runProbeBatch([
      {
        kind: "http",
        id: "refused",
        url: "http://localhost:1/",
        resolvedIp: "127.0.0.1",
        method: "GET",
        headers: {},
        body: null,
        timeoutMs: 2_000,
        readBody: false,
        maxBodyBytes: 65_536,
      },
    ]);

    const result = results?.get("refused");
    expect(result?.ok).toBe(false);
    expect(result?.errorKind).toBe("connect");
    expect(result?.error).toBeTruthy();
  });

  it("classifies a timeout", async () => {
    // 10.255.255.1 is not routable, so the connection hangs until the
    // budget runs out.
    const results = await runProbeBatch([
      {
        kind: "tcp",
        id: "timeout",
        host: "10.255.255.1",
        port: 9,
        timeoutMs: 300,
      },
    ]);

    const result = results?.get("timeout");
    expect(result?.ok).toBe(false);
    expect(result?.errorKind).toBe("timeout");
  });

  it("returns a result for every job in the batch", async () => {
    const jobs = Array.from({ length: 12 }, (_, index) =>
      httpJob(`job-${index}`, "/"),
    );
    const results = await runProbeBatch(jobs);

    expect(results?.size).toBe(12);
    for (let index = 0; index < 12; index++) {
      expect(results?.get(`job-${index}`)?.ok).toBe(true);
    }
  }, 30_000);
});
