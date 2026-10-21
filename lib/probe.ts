/**
 * Bridge to the Rust probe binary.
 *
 * The probe is a one-shot batch runner: it reads a JSON job list on stdin
 * and writes a JSON result list on stdout. The Bun app spawns it once per
 * batch, so N monitor checks cost one process, not N.
 *
 * The split of responsibility is deliberate and is the reason this can be
 * safe:
 *
 * - **The policy layer stays in TypeScript.** `lib/security.ts` resolves the
 *   hostname, checks the address against the SSRF rules, and hands the
 *   probe a validated IP. The probe never resolves a name and never decides
 *   whether a target may be reached, so it cannot become a second, weaker
 *   copy of the SSRF policy.
 * - **The probe does the syscall-bound work.** Connect, TLS handshake with
 *   the right server name, request, response, timing. That is the part that
 *   is slow and that would otherwise compete with the request handler for
 *   the event loop.
 *
 * Every entry point degrades to the TypeScript implementation if the
 * binary is missing or misbehaves. A probe that is absent must slow the
 * app down, not break it.
 */
import { existsSync } from "bun:fs";
import { join } from "bun:path";

export type ProbeErrorKind = "timeout" | "connect" | "tls" | "io" | "protocol";

export type HttpProbeJob = {
  kind: "http";
  id: string;
  url: string;
  resolvedIp: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timeoutMs: number;
  readBody: boolean;
  maxBodyBytes: number;
};

export type TcpProbeJob = {
  kind: "tcp";
  id: string;
  host: string;
  port: number;
  timeoutMs: number;
};

export type ProbeJob = HttpProbeJob | TcpProbeJob;

export type ProbeResult = {
  id: string;
  /** True when the far end was reached. A 500 response still counts as
   *  reached: "ok" is about the connection, not about the status. */
  ok: boolean;
  statusCode?: number;
  statusText?: string;
  pingMs?: number;
  headers?: Record<string, string>;
  body?: string;
  location?: string;
  error?: string;
  errorKind?: ProbeErrorKind;
};

/**
 * Where the binary may live.
 *
 * `PROBE_BINARY` names the binary exactly: when it is set, it is the only
 * candidate, so an operator can point at one specific build and be sure
 * nothing else is used. Without it, the repository checkout and the
 * container image are tried in turn.
 */
function candidatePaths(): string[] {
  const override = Bun.env.PROBE_BINARY;
  if (override) return [override];

  return [
    join(import.meta.dir, "..", "tools", "probe", "target", "release", "probe"),
    join(import.meta.dir, "..", "tools", "probe", "target", "debug", "probe"),
    "/app/probe",
  ];
}

let cachedBinary: string | null | undefined;
let cachedKey: string | undefined;

/**
 * The probe binary, or null when it is not installed.
 *
 * Cached after the first lookup: the answer cannot change while the
 * process is running, and the check runs on every batch. Changing
 * `PROBE_BINARY` invalidates the cache.
 */
export function findProbeBinary(): string | null {
  const key = Bun.env.PROBE_BINARY ?? "";
  if (cachedKey === key) return cachedBinary ?? null;

  cachedKey = key;
  cachedBinary = null;

  for (const candidate of candidatePaths()) {
    try {
      if (existsSync(candidate)) {
        cachedBinary = candidate;
        break;
      }
    } catch {
      // An unreadable path is simply not a candidate.
    }
  }
  return cachedBinary;
}

/** Whether the probe is available. */
export function isProbeAvailable(): boolean {
  return findProbeBinary() !== null;
}

/** The wire shape, which is snake_case because the Rust side deserializes it. */
type WireJob =
  | {
      kind: "http";
      id: string;
      url: string;
      resolved_ip: string;
      method: string;
      headers: Record<string, string>;
      body: string | null;
      timeout_ms: number;
      read_body: boolean;
      max_body_bytes: number;
    }
  | {
      kind: "tcp";
      id: string;
      host: string;
      port: number;
      timeout_ms: number;
    };

function toWire(job: ProbeJob): WireJob {
  if (job.kind === "tcp") {
    return {
      kind: "tcp",
      id: job.id,
      host: job.host,
      port: job.port,
      timeout_ms: job.timeoutMs,
    };
  }
  return {
    kind: "http",
    id: job.id,
    url: job.url,
    resolved_ip: job.resolvedIp,
    method: job.method,
    headers: job.headers,
    body: job.body,
    timeout_ms: job.timeoutMs,
    read_body: job.readBody,
    max_body_bytes: job.maxBodyBytes,
  };
}

/**
 * Run a batch of jobs in one probe process.
 *
 * Returns a map of job id to result, or null when the probe could not be
 * used at all — the caller then falls back to the TypeScript
 * implementation. A null is never a partial result: either the whole batch
 * came back or the app does its own work.
 */
export async function runProbeBatch(
  jobs: ProbeJob[],
  deadlineAt?: number,
): Promise<Map<string, ProbeResult> | null> {
  if (jobs.length === 0) return new Map();

  const binary = findProbeBinary();
  if (!binary) return null;

  const payload = JSON.stringify({ jobs: jobs.map(toWire) });

  let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    // The probe inherits this process's environment, which is what the
    // deadline and the proxy settings live in.
    proc = Bun.spawn([binary], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    // The binary exists but could not be started: an exec format error, a
    // permission problem, a missing loader. Fall back.
    return null;
  }

  // A kill timer, so a wedged probe cannot outlive the batch's deadline.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const killTimer =
    deadlineAt === undefined
      ? undefined
      : new Promise<"timeout">((resolve) => {
          timer = setTimeout(
            () => {
              proc.kill();
              resolve("timeout");
            },
            Math.max(0, deadlineAt - Date.now()),
          );
        });

  try {
    await proc.stdin.write(payload);
    await proc.stdin.end();

    // `Bun.readableStreamToText` reads the pipe directly. Wrapping the
    // stream in a `Response` to read it works too, and builds a whole
    // response object to do it.
    const stdoutPromise = Bun.readableStreamToText(proc.stdout);
    const stderrPromise = Bun.readableStreamToText(proc.stderr);
    const exitedPromise = proc.exited;

    if (killTimer) {
      const outcome = await Promise.race([exitedPromise, killTimer]);
      if (outcome === "timeout") return null;
    } else {
      await exitedPromise;
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      stdoutPromise,
      stderrPromise,
      exitedPromise,
    ]);

    if (exitCode !== 0) {
      console.error(
        `[probe] exited with ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
      );
      return null;
    }

    const parsed = JSON.parse(stdout) as {
      results?: {
        id: string;
        ok: boolean;
        status_code?: number;
        status_text?: string;
        ping_ms?: number;
        headers?: Record<string, string>;
        body?: string;
        location?: string;
        error?: string;
        error_kind?: ProbeErrorKind;
      }[];
    };

    if (!Array.isArray(parsed.results)) return null;

    const results = new Map<string, ProbeResult>();
    for (const result of parsed.results) {
      results.set(result.id, {
        id: result.id,
        ok: result.ok,
        statusCode: result.status_code,
        statusText: result.status_text,
        pingMs: result.ping_ms,
        headers: result.headers,
        body: result.body,
        location: result.location,
        error: result.error,
        errorKind: result.error_kind,
      });
    }
    return results;
  } catch (error) {
    console.error(
      `[probe] failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
