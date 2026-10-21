import { describe, expect, it } from "bun:test";

import type { CheckDependencies } from "@/lib/monitor-checker";
import type { Monitor } from "@/types/application";

/**
 * The in-process monitor check.
 *
 * This is the path that runs when the Rust probe is not installed, so it is
 * the safety net rather than the fast path — and a safety net that is never
 * exercised is not a safety net.
 *
 * The transport and the policy are injected rather than mocked. A
 * `mock.module` in Bun is process-wide: a test that replaced
 * `lib/security` would silently change what every other test file sees,
 * which is a flaky suite rather than a test.
 */

/** What the injected transport should answer with, per URL path. */
let responses: Map<
  string,
  {
    status: number;
    statusText: string;
    body: string;
    headers?: Record<string, string>;
  }
> = new Map();
/** The error the injected transport should throw, if any. */
let fetchError: Error | null = null;

const dependencies: CheckDependencies = {
  fetch: async (url: string) => {
    if (fetchError) throw fetchError;
    const answer = responses.get(new URL(url).pathname);
    if (!answer) throw new Error(`no canned response for ${url}`);
    return new Response(answer.body, {
      status: answer.status,
      statusText: answer.statusText,
      headers: answer.headers,
    });
  },
  resolveHost: async () => "127.0.0.1",
  resolveUrl: async (url: string) => ({
    safeUrl: url,
    resolvedIp: "203.0.113.10",
    hostname: new URL(url).hostname,
  }),
};

const { checkMonitor, HEARTBEAT_STATUS } =
  await import("@/lib/monitor-checker");

function monitor(overrides: Partial<Monitor>): Monitor {
  return {
    id: "m1",
    name: "monitor",
    type: "http",
    url: "https://example.test/",
    active: true,
    timeout: 30,
    max_retries: 0,
    ...overrides,
  } as Monitor;
}

describe("in-process HTTP check", () => {
  it("reports UP for a successful response", async () => {
    responses = new Map([
      ["/", { status: 200, statusText: "OK", body: "hello" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(monitor({}), undefined, dependencies);

    expect(result.status).toBe(HEARTBEAT_STATUS.UP);
    expect(result.msg).toBe("200 - OK");
    expect(result.ping).not.toBeNull();
  });

  it("reports DOWN for a server error", async () => {
    responses = new Map([
      ["/", { status: 500, statusText: "Internal Server Error", body: "" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(monitor({}), undefined, dependencies);
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
  });

  it("names the blocking provider in the message", async () => {
    responses = new Map([
      [
        "/",
        {
          status: 403,
          statusText: "Forbidden",
          body: "",
          headers: { server: "cloudflare" },
        },
      ],
    ]);
    fetchError = null;

    const result = await checkMonitor(monitor({}), undefined, dependencies);
    expect(result.msg).toContain("Cloudflare detected");
  });

  it("reports a missing URL", async () => {
    const result = await checkMonitor(
      monitor({ url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Missing URL");
  });

  it("inverts the result for an upside-down monitor", async () => {
    responses = new Map([
      ["/", { status: 200, statusText: "OK", body: "hello" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ upside_down: true }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
  });

  it("reports a transport failure with the underlying message", async () => {
    fetchError = new Error("connection refused");
    responses = new Map();

    const result = await checkMonitor(monitor({}), undefined, dependencies);
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("connection refused");
  });

  it("reports a timeout as a timeout", async () => {
    fetchError = Object.assign(new Error("aborted"), { name: "AbortError" });
    responses = new Map();

    const result = await checkMonitor(
      monitor({ timeout: 7 }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Timeout after 7s");
  });
});

describe("in-process keyword check", () => {
  it("reports UP when the keyword is present", async () => {
    responses = new Map([
      ["/", { status: 200, statusText: "OK", body: "the needle is here" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "keyword", keyword: "needle" }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.UP);
  });

  it("reports DOWN when the keyword is missing", async () => {
    responses = new Map([
      ["/", { status: 200, statusText: "OK", body: "nothing to see" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "keyword", keyword: "needle" }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe('Keyword "needle" not found');
  });

  it("inverts the keyword result for an upside-down monitor", async () => {
    responses = new Map([
      ["/", { status: 200, statusText: "OK", body: "the needle is here" }],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "keyword", keyword: "needle", upside_down: true }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe('Keyword "needle" found (upside down mode)');
  });
});

describe("in-process TCP check", () => {
  it("reports UP when the port accepts a connection", async () => {
    // A raw TCP listener: no HTTP, so the happy-dom preload in the test
    // suite cannot get in the way.
    const listener = Bun.listen({
      port: 0,
      hostname: "127.0.0.1",
      socket: { data() {} },
    });
    const port = listener.port;

    try {
      const result = await checkMonitor(
        monitor({ type: "tcp", hostname: "127.0.0.1", port, url: undefined }),
        undefined,
        dependencies,
      );
      expect(result.status).toBe(HEARTBEAT_STATUS.UP);
      expect(result.msg).toBe("Connection successful");
    } finally {
      listener.stop(true);
    }
  });

  it("reports DOWN when the port refuses the connection", async () => {
    const result = await checkMonitor(
      monitor({ type: "tcp", hostname: "127.0.0.1", port: 1, url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.ping).not.toBeNull();
  });

  it("inverts the result for an upside-down monitor", async () => {
    const listener = Bun.listen({
      port: 0,
      hostname: "127.0.0.1",
      socket: { data() {} },
    });
    const port = listener.port;

    try {
      const result = await checkMonitor(
        monitor({
          type: "tcp",
          hostname: "127.0.0.1",
          port,
          url: undefined,
          upside_down: true,
        }),
        undefined,
        dependencies,
      );
      expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
      expect(result.msg).toBe("Connection successful (upside down)");
    } finally {
      listener.stop(true);
    }
  });

  it("reports a missing hostname", async () => {
    const result = await checkMonitor(
      monitor({ type: "tcp", hostname: undefined, url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Missing hostname");
  });
});

describe("in-process ping check", () => {
  it("reports UP when the host answers", async () => {
    responses = new Map([["/", { status: 200, statusText: "OK", body: "" }]]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "ping", hostname: "example.test", url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.UP);
    expect(result.msg).toMatch(/^\d+ms$/);
  });

  it("reports DOWN when the host does not answer", async () => {
    fetchError = new Error("host unreachable");
    responses = new Map();

    const result = await checkMonitor(
      monitor({ type: "ping", hostname: "example.test", url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("host unreachable");
  });

  it("reports a missing hostname", async () => {
    const result = await checkMonitor(
      monitor({ type: "ping", hostname: undefined, url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Missing hostname");
  });
});

describe("in-process DNS check", () => {
  /** A DNS-over-HTTPS answer, as the resolver returns it. */
  function answer(status: number, data?: string): string {
    return JSON.stringify({
      Status: status,
      ...(data && { Answer: [{ data }] }),
    });
  }

  it("reports UP when the name resolves", async () => {
    responses = new Map([
      [
        "/resolve",
        { status: 200, statusText: "OK", body: answer(0, "93.184.216.34") },
      ],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "dns", hostname: "example.test", url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.UP);
    expect(result.msg).toBe("Resolved: 93.184.216.34");
  });

  it("reports DOWN when the name does not resolve", async () => {
    responses = new Map([
      ["/resolve", { status: 200, statusText: "OK", body: answer(3) }],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "dns", hostname: "example.test", url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("DNS resolution failed");
  });

  it("inverts the result for an upside-down monitor", async () => {
    responses = new Map([
      [
        "/resolve",
        { status: 200, statusText: "OK", body: answer(0, "93.184.216.34") },
      ],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({
        type: "dns",
        hostname: "example.test",
        url: undefined,
        upside_down: true,
      }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Resolved (upside down)");
  });

  it("reports a missing hostname", async () => {
    const result = await checkMonitor(
      monitor({ type: "dns", hostname: undefined, url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("Missing hostname");
  });

  it("reports a resolver error", async () => {
    responses = new Map([
      [
        "/resolve",
        { status: 500, statusText: "Server Error", body: answer(0) },
      ],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "dns", hostname: "example.test", url: undefined }),
      undefined,
      dependencies,
    );
    expect(result.status).toBe(HEARTBEAT_STATUS.DOWN);
    expect(result.msg).toBe("DNS resolver error: 500");
  });

  it("asks the public resolver through the injected transport", async () => {
    // The monitored name is a query parameter, never the target of the
    // request: the request goes to the resolver, which is a fixed public
    // endpoint. That is why the SSRF policy does not apply to the name
    // itself — but the request still goes through the injected transport, so
    // the check never touches the network and is testable.
    const requested: string[] = [];
    responses = new Map([
      [
        "/resolve",
        { status: 200, statusText: "OK", body: answer(0, "93.184.216.34") },
      ],
    ]);
    fetchError = null;

    const result = await checkMonitor(
      monitor({ type: "dns", hostname: "example.test", url: undefined }),
      undefined,
      {
        ...dependencies,
        fetch: async (url: string) => {
          requested.push(url);
          return dependencies.fetch(url);
        },
      },
    );

    expect(result.status).toBe(HEARTBEAT_STATUS.UP);
    expect(requested).toHaveLength(1);
    const url = new URL(requested[0]);
    expect(url.origin).toBe("https://dns.google");
    expect(url.pathname).toBe("/resolve");
    expect(url.searchParams.get("name")).toBe("example.test");
  });
});
