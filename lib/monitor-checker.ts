import {
  type AnalyticsStore,
  defaultAnalyticsStore,
  updateMonitorAnalytics,
} from "@/lib/analytics";
import {
  classifyErrorType,
  classifyStatusTransition,
  determineEffectiveStatus,
  HEARTBEAT_STATUS,
  nextConsecutiveUptime,
} from "@/lib/monitor-status";
import {
  defaultNotificationDependencies,
  type NotificationDependencies,
  notifyMonitor,
} from "@/lib/notifications";
import { type ProbeJob, type ProbeResult, runProbeBatch } from "@/lib/probe";
import {
  fetchWithSsrfProtection,
  formatHostForUrl,
  resolveAndValidateHost,
  resolveAndValidateUrl,
} from "@/lib/security";
import {
  checkSslCertificate,
  defaultSslDependencies,
  shouldWarnSslExpiry,
  SSL_DAYS_REMAINING_UNKNOWN,
  type SslDependencies,
} from "@/lib/ssl-utils";
import {
  createServiceClient,
  type ServiceClient,
} from "@/lib/supabase/service";
import type { Heartbeat, Monitor } from "@/types/application";

export { determineEffectiveStatus, HEARTBEAT_STATUS };

export const INCIDENT_STATUS = {
  OPEN: 0,
  RESOLVED: 1,
  INVESTIGATING: 2,
} as const;

export const MONITOR_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  MAINTENANCE: "maintenance",
  DEGRADED: "degraded",
} as const;

const DEFAULT_TIMEOUT_SECONDS = 48;
const USER_AGENT = "Uptime-Monitor/1.0";

export type CheckResult = {
  status: number;
  ping: number | null;
  msg: string;
};

type HeartbeatInsert = {
  monitor_id: string;
  status: number;
  msg: string;
  ping: number | null;
  duration: number;
  down_count: number;
  time: string;
  error_type: string | null;
  checked_by?: string | null;
};

type PreviousHeartbeat = Pick<Heartbeat, "status" | "down_count">;

/**
 * The monitor fields the state machine writes.
 *
 * Written out rather than left as an open record, so that a typo in a
 * column name is a type error rather than a silent no-op.
 */
export type MonitorPatch = {
  status?: number;
  down_count?: number;
  consecutive_uptime?: number;
  last_check_at?: string;
  last_status_change_at?: string;
  ssl_expiry?: string;
  ssl_issuer?: string;
};

/**
 * The rows the state machine reads and writes.
 *
 * A narrow port, for the same reason as the channel store: `mock.module` in
 * Bun is process-wide, so a test that replaced one would silently change
 * what every other test file sees. It is also the machine's contract with
 * the database, written down in one place.
 */
export type CheckStore = {
  /** Is the monitor inside an active maintenance window? */
  underMaintenance(monitorId: string): Promise<boolean>;

  /** The most recent heartbeat for a monitor. */
  previousHeartbeat(monitorId: string): Promise<PreviousHeartbeat | null>;

  /** Record a heartbeat. */
  recordHeartbeat(heartbeat: HeartbeatInsert): Promise<void>;

  /** Update the monitor's row. */
  updateMonitor(id: string, patch: MonitorPatch): Promise<void>;

  /** The certificate expiry recorded on the monitor, if there is one. */
  sslExpiry(monitorId: string): Promise<string | null>;

  /** The open incident for a monitor, if there is one. */
  openIncident(monitorId: string): Promise<{ id: string } | null>;

  /** Open an incident. */
  createIncident(incident: {
    monitor_id: string;
    title: string;
    content: string;
    status: number;
    started_at: string;
  }): Promise<void>;

  /** Resolve the open incidents for a monitor. */
  resolveIncidents(monitorId: string): Promise<void>;
};

export function createSupabaseStore(
  service: () => ServiceClient = () => createServiceClient(),
): CheckStore {
  return {
    async underMaintenance(monitorId) {
      const supabase = service();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("maintenance_monitors")
        .select(
          `
          maintenance:maintenance_id (
            active,
            start_date,
            end_date
          )
        `,
        )
        .eq("monitor_id", monitorId);

      if (error) {
        throw new Error(`Failed to read maintenance state: ${error.message}`);
      }

      if (!data || data.length === 0) return false;

      return (
        data as unknown as Array<{
          maintenance: {
            active: boolean;
            start_date: string;
            end_date: string;
          };
        }>
      ).some((item) => {
        const m = item.maintenance;
        return m?.active && m.start_date <= now && m.end_date >= now;
      });
    },

    async previousHeartbeat(monitorId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("heartbeats")
        .select("status, down_count")
        .eq("monitor_id", monitorId)
        .order("time", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to read previous heartbeat: ${error.message}`);
      }

      return data ?? null;
    },

    async recordHeartbeat(heartbeat) {
      const supabase = service();
      const { error } = await supabase.from("heartbeats").insert(heartbeat);
      if (error) {
        throw new Error(`Failed to record heartbeat: ${error.message}`);
      }
    },

    async updateMonitor(id, patch) {
      const supabase = service();
      // Built field by field rather than spread: the spread would widen a
      // field past the column's type.
      const update: {
        status?: number;
        down_count?: number;
        consecutive_uptime?: number;
        last_check_at?: string;
        last_status_change_at?: string;
        ssl_expiry?: string;
        ssl_issuer?: string;
      } = {};
      if (patch.status !== undefined) update.status = patch.status;
      if (patch.down_count !== undefined) update.down_count = patch.down_count;
      if (patch.consecutive_uptime !== undefined) {
        update.consecutive_uptime = patch.consecutive_uptime;
      }
      if (patch.last_check_at !== undefined) {
        update.last_check_at = patch.last_check_at;
      }
      if (patch.last_status_change_at !== undefined) {
        update.last_status_change_at = patch.last_status_change_at;
      }
      if (patch.ssl_expiry !== undefined) update.ssl_expiry = patch.ssl_expiry;
      if (patch.ssl_issuer !== undefined) update.ssl_issuer = patch.ssl_issuer;

      const { error } = await supabase
        .from("monitors")
        .update(update)
        .eq("id", id);

      if (error) {
        throw new Error(`Failed to update monitor state: ${error.message}`);
      }
    },

    async sslExpiry(monitorId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("monitors")
        .select("ssl_expiry")
        .eq("id", monitorId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to read SSL state: ${error.message}`);
      }

      return data?.ssl_expiry ?? null;
    },

    async openIncident(monitorId) {
      const supabase = service();
      const { data, error } = await supabase
        .from("incidents")
        .select("id")
        .eq("monitor_id", monitorId)
        .eq("status", INCIDENT_STATUS.OPEN)
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to check existing incidents: ${error.message}`);
      }

      return data ?? null;
    },

    async createIncident(incident) {
      const supabase = service();
      const { error } = await supabase.from("incidents").insert(incident);

      if (error) {
        throw new Error(`Failed to create incident: ${error.message}`);
      }
    },

    async resolveIncidents(monitorId) {
      const supabase = service();
      const { error } = await supabase
        .from("incidents")
        .update({
          status: INCIDENT_STATUS.RESOLVED,
          resolved_at: new Date().toISOString(),
        })
        .eq("monitor_id", monitorId)
        .eq("status", INCIDENT_STATUS.OPEN);

      if (error) {
        throw new Error(`Failed to resolve incidents: ${error.message}`);
      }
    },
  };
}

const DEFAULT_STORE: CheckStore = createSupabaseStore();

/**
 * Everything the state machine reaches for.
 *
 * Four narrow ports, each with a reason to exist: the rows the machine
 * writes, the rolling aggregate, the notification delivery, and the
 * certificate check. A test can replace any of them without replacing a
 * module, which is what makes the machine's decisions testable at all.
 */
export type ProcessDependencies = {
  /** The rows the state machine reads and writes. */
  store: CheckStore;
  /** The rolling aggregate. */
  analytics: AnalyticsStore;
  /** The notification delivery. */
  notifications: NotificationDependencies;
  /** The certificate check. */
  ssl: SslDependencies;
};

export const defaultProcessDependencies: ProcessDependencies = {
  store: DEFAULT_STORE,
  analytics: defaultAnalyticsStore,
  notifications: defaultNotificationDependencies,
  ssl: defaultSslDependencies,
};

const MAX_RESPONSE_BYTES = 1_048_576;

async function readResponseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("Response body exceeds the 1 MiB limit");
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new Error("Response body exceeds the 1 MiB limit");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Response body exceeds the 1 MiB limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function assertBeforeDeadline(deadlineAt?: number): void {
  if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
    throw new Error("Execution deadline exceeded");
  }
}

function getRemainingSeconds(
  timeoutSeconds: number,
  deadlineAt?: number,
): number {
  if (deadlineAt === undefined) return timeoutSeconds;
  return Math.min(
    timeoutSeconds,
    Math.max(0, (deadlineAt - Date.now()) / 1000),
  );
}

/**
 * The parts of an HTTP response that the check logic cares about, whether
 * they came from `fetch` or from the Rust probe.
 */
type HttpOutcome = {
  status: number;
  statusText: string;
  headers: Headers;
  /** The response body, when the check needed it. */
  body?: string;
  ping: number | null;
};

/** Whether an HTTP status counts as a success, the way `Response.ok` does. */
function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Turn an HTTP response into a check result.
 *
 * Pure: no I/O, no clock. The keyword match, the upside-down inversion and
 * the message enrichment all live here, so the probe path and the fetch
 * path cannot drift apart.
 */
function interpretHttpOutcome(
  monitor: Monitor,
  outcome: HttpOutcome,
): CheckResult {
  const { status, statusText, headers, body, ping } = outcome;

  if (monitor.type === "keyword" && monitor.keyword) {
    const keywordFound = (body ?? "").includes(monitor.keyword);
    const success = monitor.upside_down ? !keywordFound : keywordFound;

    if (!success) {
      return {
        status: HEARTBEAT_STATUS.DOWN,
        ping,
        msg: monitor.upside_down
          ? `Keyword "${monitor.keyword}" found (upside down mode)`
          : `Keyword "${monitor.keyword}" not found`,
      };
    }
  }

  const isSuccess = monitor.upside_down
    ? !isOkStatus(status)
    : isOkStatus(status);

  let msg = `${status} - ${statusText}`;

  // Enrich message for common blocking scenarios
  if (status === 429 || status === 403) {
    const server = headers.get("server")?.toLowerCase() || "";
    const mitigated = headers.get("x-vercel-mitigated");

    if (server.includes("vercel") || mitigated) {
      msg +=
        " (Vercel Protection detected - try adding x-vercel-protection-bypass header)";
    } else if (server.includes("cloudflare")) {
      msg += " (Cloudflare detected - try whitelisting monitor IP)";
    }
  }

  return {
    status: isSuccess ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
    ping,
    msg,
  };
}

/**
 * Perform an HTTP/HTTPS monitor check
 */
async function checkHttp(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  assertBeforeDeadline(deadlineAt);

  if (!monitor.url) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: "Missing URL",
    };
  }

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...(monitor.headers as Record<string, string> | null),
    };

    const { controller, clear } = createTimeoutController(timeout, deadlineAt);

    try {
      const response = await dependencies.fetch(monitor.url, {
        method: monitor.method || "GET",
        headers,
        body: monitor.body || undefined,
        signal: controller.signal,
      });

      let responseText: string | undefined;
      if (monitor.type === "keyword" && monitor.keyword) {
        responseText = await readResponseText(response);
      }

      return interpretHttpOutcome(monitor, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: responseText,
        ping: Date.now() - startTime,
      });
    } finally {
      clear();
    }
  } catch (error) {
    const ping = Date.now() - startTime;

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: HEARTBEAT_STATUS.DOWN,
        ping,
        msg: `Timeout after ${timeout}s`,
      };
    }

    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping,
      msg: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

function openTcpConnection(
  hostname: string,
  port: number,
  timeoutSeconds: number,
  deadlineAt?: number,
): Promise<void> {
  const effectiveTimeout = getRemainingSeconds(timeoutSeconds, deadlineAt);
  if (effectiveTimeout <= 0) {
    return Promise.reject(new Error("Execution deadline exceeded"));
  }

  // The probe only has to prove the port is reachable, so the socket is
  // closed as soon as it opens.
  const connecting = Bun.connect({
    hostname,
    port,
    socket: { data() {} },
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Timeout after ${timeoutSeconds}s`)),
      effectiveTimeout * 1_000,
    );
  });

  return Promise.race([connecting, timeout])
    .then((socket) => {
      socket.end();
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
      // A connection that lost the race to the timeout still lands later;
      // close it so it does not leak.
      void connecting.then((socket) => socket.end()).catch(() => {});
    });
}

/**
 * Perform a TCP monitor check using actual TCP connection
 */
async function checkTcp(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  assertBeforeDeadline(deadlineAt);

  if (!monitor.hostname) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: "Missing hostname",
    };
  }

  let safeHostname: string;
  try {
    safeHostname = await dependencies.resolveHost(monitor.hostname);
  } catch (error) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: `SSRF Blocked: ${(error as Error).message}`,
    };
  }

  let ping: number | null;
  let success: boolean;
  let msg: string;

  try {
    await openTcpConnection(
      safeHostname,
      monitor.port || 80,
      timeout,
      deadlineAt,
    );

    ping = Date.now() - startTime;
    success = !monitor.upside_down;

    msg = success
      ? "Connection successful"
      : "Connection successful (upside down)";
  } catch (error) {
    ping = Date.now() - startTime;
    success = monitor.upside_down;

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
        ping,
        msg: `Timeout after ${timeout}s`,
      };
    }

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: error instanceof Error ? error.message : "Connection failed",
    };
  }

  return {
    status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
    ping,
    msg,
  };
}

/**
 * Perform a Ping monitor check using HTTP HEAD
 */
async function checkPing(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  assertBeforeDeadline(deadlineAt);

  if (!monitor.hostname) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: "Missing hostname",
    };
  }

  let safeHostname: string;
  try {
    // If it's a URL in ping (rare, but possible due to UI), parse out the hostname
    const hostToResolve = monitor.hostname.startsWith("http")
      ? new URL(monitor.hostname).hostname
      : monitor.hostname;

    safeHostname = await dependencies.resolveHost(hostToResolve);
  } catch (error) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: `SSRF Blocked: ${(error as Error).message}`,
    };
  }

  let ping: number | null;
  let isReachable: boolean;
  let success: boolean;
  let msg: string;

  try {
    const url = monitor.hostname?.startsWith("http")
      ? new URL(monitor.hostname)
      : new URL(`https://${formatHostForUrl(safeHostname)}`);
    if (monitor.hostname?.startsWith("http")) {
      url.hostname = safeHostname;
    }

    const { controller, clear } = createTimeoutController(timeout, deadlineAt);

    try {
      const response = await dependencies.fetch(url.toString(), {
        method: "HEAD",
        signal: controller.signal,
      });
      clear();

      ping = Date.now() - startTime;
      isReachable = response.ok || response.status < 500;
      success = monitor.upside_down ? !isReachable : isReachable;

      msg = `${ping}ms`;
    } finally {
      clear();
    }
  } catch (error) {
    ping = Date.now() - startTime;
    success = monitor.upside_down;

    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
        ping,
        msg: `Timeout after ${timeout}s`,
      };
    }

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: error instanceof Error ? error.message : "Host unreachable",
    };
  }

  return {
    status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
    ping,
    msg,
  };
}

/**
 * Perform a DNS monitor check using public DNS resolver
 *
 * The resolver is a fixed public endpoint, so the *monitored* name is only a
 * query parameter and never the target of a request. The request itself still
 * goes through the SSRF-protected transport: it is pinned to a validated
 * address, and it is injected, so the check is testable without a network.
 */
async function checkDns(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckResult> {
  if (!monitor.hostname) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: "Missing hostname",
    };
  }

  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  assertBeforeDeadline(deadlineAt);
  const { controller, clear } = createTimeoutController(timeout, deadlineAt);

  try {
    const encodedHostname = encodeURIComponent(monitor.hostname || "");

    const response = await dependencies.fetch(
      `https://dns.google/resolve?name=${encodedHostname}&type=A`,
      { signal: controller.signal },
    );
    // `response.json()` is `any`; the cast is what gives the values a
    // shape, and the checks below are what make the shape trustworthy.
    const data = (await response.json()) as {
      Status: number;
      Answer?: Array<{ data: string }>;
    };
    clear();

    if (!response.ok) {
      throw new Error(`DNS resolver error: ${response.status}`);
    }
    const ping = Date.now() - startTime;
    const resolved =
      data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
    const success = monitor.upside_down ? !resolved : resolved;

    if (success && resolved) {
      return {
        status: HEARTBEAT_STATUS.UP,
        ping,
        msg: `Resolved: ${data.Answer![0].data}`,
      };
    }

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: resolved ? "Resolved (upside down)" : "DNS resolution failed",
    };
  } catch (error) {
    clear();
    const ping = Date.now() - startTime;
    const success = monitor.upside_down
      ? HEARTBEAT_STATUS.UP
      : HEARTBEAT_STATUS.DOWN;

    return {
      status: success,
      ping,
      msg: error instanceof Error ? error.message : "DNS query failed",
    };
  }
}

/**
 * Create an AbortController with timeout
 */
function createTimeoutController(timeoutSeconds: number, deadlineAt?: number) {
  const controller = new AbortController();
  const effectiveTimeout = getRemainingSeconds(timeoutSeconds, deadlineAt);
  if (effectiveTimeout <= 0) {
    controller.abort();
  }
  const timeoutId = setTimeout(
    () => controller.abort(),
    Math.max(1, effectiveTimeout * 1000),
  );
  return { controller, clear: () => clearTimeout(timeoutId) };
}

/**
 * Main check dispatcher
 */
/**
 * The parts of a check that touch the network.
 *
 * They are injected rather than imported so the check logic can be tested
 * without a module mock. A `mock.module` in Bun is process-wide, so a test
 * that replaced `lib/security` would silently change what every other test
 * file sees — which is a flaky suite, not a test.
 */
export type CheckDependencies = {
  /** The SSRF-protected transport. */
  fetch: typeof fetchWithSsrfProtection;
  /** Resolve and validate a hostname. */
  resolveHost: typeof resolveAndValidateHost;
  /** Resolve and validate a URL. */
  resolveUrl: typeof resolveAndValidateUrl;
};

const DEFAULT_DEPENDENCIES: CheckDependencies = {
  fetch: fetchWithSsrfProtection,
  resolveHost: resolveAndValidateHost,
  resolveUrl: resolveAndValidateUrl,
};

export async function checkMonitor(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckResult> {
  switch (monitor.type) {
    case "http":
    case "keyword":
      return checkHttp(monitor, deadlineAt, dependencies);
    case "tcp":
      return checkTcp(monitor, deadlineAt, dependencies);
    case "ping":
      return checkPing(monitor, deadlineAt, dependencies);
    case "dns":
      return checkDns(monitor, deadlineAt, dependencies);
    default:
      return {
        status: HEARTBEAT_STATUS.PENDING,
        ping: null,
        msg: `Unsupported monitor type: ${monitor.type}`,
      };
  }
}

// ---------------------------------------------------------------------------
// Probe-backed checks
//
// The Rust probe does the syscall-bound half of a check: connect, TLS
// handshake, request, response, timing. The policy half — deciding what may
// be reached at all — stays here, in TypeScript, so there is exactly one
// implementation of the SSRF rules.
//
// The split is what makes it safe to hand a URL to a separate process: the
// process is given an address that has already been resolved and validated,
// and it never resolves a name itself.
// ---------------------------------------------------------------------------

/** How many redirects a check may follow, matching the fetch path. */
const MAX_REDIRECTS = 5;

/**
 * One HTTP attempt: a URL that has already passed the SSRF policy, plus the
 * request to make against it.
 */
type HttpAttempt = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  /** The origin of the first hop, for the cross-origin reset. */
  initialOrigin: string;
  /** How many redirects have been followed so far. */
  redirects: number;
  /** Whether the response body is needed. */
  readBody: boolean;
};

/**
 * What has to happen for one monitor, before anything is sent.
 */
type CheckPlan = {
  monitor: Monitor;
  /** A final result, when the check is already decided. */
  result: CheckResult | null;
  /** The probe job to run. */
  job: ProbeJob | null;
  /** The attempt behind the job, for the redirect bookkeeping. */
  attempt: HttpAttempt | null;
  /** True when the check runs in-process rather than through the probe. */
  inProcess: boolean;
};

/**
 * Work out what to check, without checking it.
 *
 * This is the policy phase: it resolves the hostname, validates the address
 * against the SSRF rules, and produces a job the probe can run. A monitor
 * that is blocked, missing its URL, or of a type the probe does not handle
 * is decided here.
 */
async function planCheck(
  monitor: Monitor,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<CheckPlan> {
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  const plan: CheckPlan = {
    monitor,
    result: null,
    job: null,
    attempt: null,
    inProcess: false,
  };

  if (monitor.type === "http" || monitor.type === "keyword") {
    if (!monitor.url) {
      return {
        ...plan,
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: null,
          msg: "Missing URL",
        },
      };
    }

    let resolvedIp: string;
    try {
      ({ resolvedIp } = await dependencies.resolveUrl(monitor.url));
    } catch (error) {
      return {
        ...plan,
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: null,
          msg: `SSRF Blocked: ${(error as Error).message}`,
        },
      };
    }

    const attempt: HttpAttempt = {
      url: monitor.url,
      method: monitor.method || "GET",
      headers: {
        "User-Agent": USER_AGENT,
        ...(monitor.headers as Record<string, string> | null),
      },
      body: monitor.body || null,
      initialOrigin: new URL(monitor.url).origin,
      redirects: 0,
      readBody: monitor.type === "keyword" && Boolean(monitor.keyword),
    };

    return {
      ...plan,
      attempt,
      job: {
        kind: "http",
        id: monitor.id,
        url: attempt.url,
        resolvedIp,
        method: attempt.method,
        headers: attempt.headers,
        body: attempt.body,
        timeoutMs: Math.round(getRemainingSeconds(timeout, deadlineAt) * 1_000),
        readBody: attempt.readBody,
        maxBodyBytes: MAX_RESPONSE_BYTES,
      },
    };
  }

  if (monitor.type === "tcp") {
    if (!monitor.hostname) {
      return {
        ...plan,
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: null,
          msg: "Missing hostname",
        },
      };
    }

    let resolvedIp: string;
    try {
      resolvedIp = await dependencies.resolveHost(monitor.hostname);
    } catch (error) {
      return {
        ...plan,
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: null,
          msg: `SSRF Blocked: ${(error as Error).message}`,
        },
      };
    }

    return {
      ...plan,
      job: {
        kind: "tcp",
        id: monitor.id,
        host: resolvedIp,
        port: monitor.port || 80,
        timeoutMs: Math.round(getRemainingSeconds(timeout, deadlineAt) * 1_000),
      },
    };
  }

  // Ping and DNS run in-process: one is a resolver call the policy layer
  // already makes, and neither benefits from a separate process.
  return { ...plan, inProcess: true };
}

/**
 * Decide what to do with a probe result.
 *
 * Either the check is finished, or a redirect means there is another hop to
 * request — and that hop has to pass the policy again before it is sent.
 */
async function applyProbeResult(
  plan: CheckPlan,
  result: ProbeResult | undefined,
  deadlineAt?: number,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ result: CheckResult } | { next: CheckPlan }> {
  const monitor = plan.monitor;
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;

  if (!result) {
    return {
      result: {
        status: HEARTBEAT_STATUS.DOWN,
        ping: null,
        msg: "Probe returned no result",
      },
    };
  }

  if (!result.ok) {
    return {
      result: {
        status: HEARTBEAT_STATUS.DOWN,
        ping: result.pingMs ?? null,
        msg:
          result.errorKind === "timeout"
            ? `Timeout after ${timeout}s`
            : (result.error ?? "Connection failed"),
      },
    };
  }

  if (plan.attempt === null) {
    // A TCP check.
    const success = !monitor.upside_down;
    return {
      result: {
        status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
        ping: result.pingMs ?? null,
        msg: success
          ? "Connection successful"
          : "Connection successful (upside down)",
      },
    };
  }

  const attempt = plan.attempt;
  const status = result.statusCode ?? 0;
  const statusText = result.statusText ?? "";

  const isRedirect = [301, 302, 303, 307, 308].includes(status);
  if (isRedirect && result.location) {
    if (attempt.redirects >= MAX_REDIRECTS) {
      return {
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: result.pingMs ?? null,
          msg: "Too many redirects",
        },
      };
    }

    let nextUrl: string;
    try {
      nextUrl = new URL(result.location, attempt.url).toString();
    } catch {
      return {
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: result.pingMs ?? null,
          msg: "Invalid redirect location",
        },
      };
    }

    const nextOrigin = new URL(nextUrl).origin;
    let { method, headers, body } = attempt;

    // A redirect to another origin drops the headers, and a redirect that
    // changes the method drops the body. This mirrors the fetch path
    // exactly, so a monitor sees the same result either way.
    if (nextOrigin !== attempt.initialOrigin) {
      headers = {};
      method = "GET";
      body = null;
    } else if (
      status === 303 ||
      ((status === 301 || status === 302) && method === "POST")
    ) {
      method = "GET";
      body = null;
    }

    const nextAttempt: HttpAttempt = {
      ...attempt,
      url: nextUrl,
      method,
      headers,
      body,
      redirects: attempt.redirects + 1,
    };

    // The redirect target is a new destination, so it has to pass the
    // policy again before it is requested.
    let resolvedIp: string;
    try {
      ({ resolvedIp } = await dependencies.resolveUrl(nextUrl));
    } catch (error) {
      return {
        result: {
          status: HEARTBEAT_STATUS.DOWN,
          ping: result.pingMs ?? null,
          msg: `SSRF Blocked: ${(error as Error).message}`,
        },
      };
    }

    return {
      next: {
        ...plan,
        attempt: nextAttempt,
        job: {
          kind: "http",
          id: monitor.id,
          url: nextAttempt.url,
          resolvedIp,
          method: nextAttempt.method,
          headers: nextAttempt.headers,
          body: nextAttempt.body,
          timeoutMs: Math.round(
            getRemainingSeconds(timeout, deadlineAt) * 1_000,
          ),
          readBody: nextAttempt.readBody,
          maxBodyBytes: MAX_RESPONSE_BYTES,
        },
      },
    };
  }

  return {
    result: interpretHttpOutcome(monitor, {
      status,
      statusText,
      headers: new Headers(result.headers ?? {}),
      body: result.body,
      ping: result.pingMs ?? null,
    }),
  };
}

/**
 * How a batch of jobs reaches the probe.
 *
 * Injected rather than imported so the orchestration can be tested without
 * a process boundary, and so a caller can decide up front whether the
 * probe is worth using at all.
 */
export type ProbeRunner = (
  jobs: ProbeJob[],
  deadlineAt?: number,
) => Promise<Map<string, ProbeResult> | null>;

/**
 * Run a batch of monitor checks through the Rust probe.
 *
 * Returns the results it managed to produce, keyed by monitor id. A monitor
 * that is missing from the map was not decided here — the caller runs it
 * in-process instead, which is also what happens when the probe is not
 * installed at all.
 *
 * Every monitor in the batch goes through the policy phase first, then the
 * whole batch is sent to a single probe process. A redirect produces
 * another round, but only the monitors that redirected take part in it.
 */
export async function planMonitorChecks(
  monitors: Monitor[],
  deadlineAt?: number,
  runner: ProbeRunner = runProbeBatch,
  dependencies: CheckDependencies = DEFAULT_DEPENDENCIES,
): Promise<Map<string, CheckResult>> {
  const results = new Map<string, CheckResult>();

  const plans = await Promise.all(
    monitors.map((monitor) => planCheck(monitor, deadlineAt, dependencies)),
  );

  let pending = plans.filter((plan) => plan.job !== null);
  for (const plan of plans) {
    if (plan.result) results.set(plan.monitor.id, plan.result);
  }

  for (let round = 0; round <= MAX_REDIRECTS + 1; round++) {
    if (pending.length === 0) break;

    const jobs = pending
      .map((plan) => plan.job)
      .filter((job): job is ProbeJob => job !== null);
    const probeResults = await runner(jobs, deadlineAt);

    if (!probeResults) {
      // The probe could not be used. The caller falls back to the
      // in-process implementation for everything that is still pending.
      return results;
    }

    const next: CheckPlan[] = [];
    for (const plan of pending) {
      const outcome = await applyProbeResult(
        plan,
        probeResults.get(plan.monitor.id),
        deadlineAt,
        dependencies,
      );
      if ("result" in outcome) {
        results.set(plan.monitor.id, outcome.result);
      } else {
        next.push(outcome.next);
      }
    }
    pending = next;
  }

  return results;
}

/**
 * Process a single monitor check (Uptime Kuma style)
 *
 * Key behaviors:
 * 1. Tracks down_count for consecutive failures
 * 2. Only marks as DOWN after max_retries consecutive failures
 * 3. Respects maintenance windows
 * 4. Only notifies on actual status changes
 * 5. Supports upside_down mode (inverts success/failure)
 * 6. Only DOWN/UP/PENDING are produced here; DEGRADED (4) is reserved and
 *    never emitted, so it must not be treated as a reachable state
 */
function getDegradedThresholdMs(monitor: Monitor): number {
  return Math.max(500, Math.floor(monitor.timeout * 1000 * 0.8));
}

function applyDegradedStatus(
  result: CheckResult,
  monitor: Monitor,
): CheckResult {
  if (result.status !== HEARTBEAT_STATUS.UP) return result;
  if (result.ping === null) return result;

  const threshold = getDegradedThresholdMs(monitor);
  if (result.ping >= threshold) {
    return {
      ...result,
      status: HEARTBEAT_STATUS.DEGRADED,
      msg: `${result.msg} (slow: ${result.ping}ms > ${threshold}ms threshold)`,
    };
  }
  return result;
}

export async function processMonitorCheck(
  monitor: Monitor,
  deadlineAt?: number,
  options?: { triggeredBy?: string; precomputed?: CheckResult },
  dependencies: ProcessDependencies = defaultProcessDependencies,
): Promise<void> {
  const { store } = dependencies;
  assertBeforeDeadline(deadlineAt);
  const checkStartTime = Date.now();

  // Check maintenance status first
  const inMaintenance = await store.underMaintenance(monitor.id);
  if (inMaintenance) {
    assertBeforeDeadline(deadlineAt);
    const checkedAt = new Date().toISOString();
    await store.recordHeartbeat({
      monitor_id: monitor.id,
      status: HEARTBEAT_STATUS.MAINTENANCE,
      msg: "Under maintenance",
      ping: null,
      duration: 0,
      down_count: 0,
      time: checkedAt,
      // No failure to describe: the monitor is intentionally suspended.
      error_type: classifyErrorType(null, HEARTBEAT_STATUS.MAINTENANCE),
    });
    await store.updateMonitor(monitor.id, {
      status: HEARTBEAT_STATUS.MAINTENANCE,
      down_count: 0,
      last_check_at: checkedAt,
      // consecutive_uptime is deliberately left untouched: a maintenance
      // window suspends the streak, it does not end it.
      ...(monitor.status !== HEARTBEAT_STATUS.MAINTENANCE && {
        last_status_change_at: checkedAt,
      }),
    });
    return;
  }

  // Get previous heartbeat for down_count tracking
  const previousHeartbeat = await store.previousHeartbeat(monitor.id);
  const previousDownCount = previousHeartbeat?.down_count ?? 0;
  const previousStatus = previousHeartbeat?.status ?? null;

  // Perform the actual check. A pre-computed result comes from the batched
  // probe path, where the whole batch was sent to one probe process;
  // without it the check runs here, in-process.
  const rawResult =
    options?.precomputed ?? (await checkMonitor(monitor, deadlineAt));
  const result = applyDegradedStatus(rawResult, monitor);
  const duration = Date.now() - checkStartTime;

  // Calculate new down_count and effective status (Uptime Kuma logic)
  const { status: effectiveStatus, downCount } = determineEffectiveStatus(
    result.status,
    previousStatus,
    previousDownCount,
    monitor.max_retries,
  );

  assertBeforeDeadline(deadlineAt);
  const checkedAt = new Date().toISOString();

  await store.recordHeartbeat({
    monitor_id: monitor.id,
    status: effectiveStatus,
    msg: result.msg,
    ping: result.ping,
    duration,
    down_count: downCount,
    time: checkedAt,
    error_type: classifyErrorType(result.msg, effectiveStatus),
    ...(options?.triggeredBy && { checked_by: options.triggeredBy }),
  });

  await store.updateMonitor(monitor.id, {
    status: effectiveStatus,
    down_count: downCount,
    consecutive_uptime: nextConsecutiveUptime(
      monitor.consecutive_uptime,
      effectiveStatus,
    ),
    last_check_at: checkedAt,
    ...(effectiveStatus !== previousStatus && {
      last_status_change_at: checkedAt,
    }),
  });

  await updateMonitorAnalytics(monitor, dependencies.analytics);

  // SSL Certificate check for HTTPS monitors (runs periodically, not every check)
  if (
    (monitor.type === "http" || monitor.type === "keyword") &&
    monitor.url?.startsWith("https://") &&
    (deadlineAt === undefined || deadlineAt - Date.now() > 10_000)
  ) {
    await checkAndUpdateSsl(monitor, deadlineAt, dependencies);
  }

  // Handle notifications only on actual status changes
  // and only when we've exceeded retry threshold
  if (effectiveStatus !== previousStatus) {
    await handleStatusChange(
      monitor,
      previousStatus,
      effectiveStatus,
      result.msg,
      deadlineAt,
      dependencies,
    );
  }
}

/**
 * Check if monitor is under maintenance
 */
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Notification delivery timed out")),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sendStatusNotification(
  monitor: Monitor,
  payload: Parameters<typeof notifyMonitor>[2],
  deadlineAt: number | undefined,
  dependencies: ProcessDependencies,
): Promise<void> {
  const remaining =
    deadlineAt === undefined
      ? 5_000
      : Math.min(5_000, Math.max(1, deadlineAt - Date.now()));
  const result = await withTimeout(
    notifyMonitor(
      monitor.id,
      monitor.user_id,
      payload,
      deadlineAt,
      dependencies.notifications,
    ),
    remaining,
  );
  if (result.failed > 0) {
    console.error(
      `[${monitor.name}] Notification delivery failed:`,
      result.errors,
    );
  }
}

/**
 * Handle status change notifications and incidents
 */
async function handleStatusChange(
  monitor: Monitor,
  previousStatus: number | null,
  currentStatus: number,
  msg: string,
  deadlineAt: number | undefined,
  dependencies: ProcessDependencies,
): Promise<void> {
  const { store } = dependencies;
  assertBeforeDeadline(deadlineAt);
  // No change or first heartbeat with UP status - no notification needed
  if (previousStatus === currentStatus) return;
  if (previousStatus === null && currentStatus === HEARTBEAT_STATUS.UP) return;

  const { isDown, isRecovery, isDegraded } = classifyStatusTransition(
    previousStatus,
    currentStatus,
  );

  if (isDown) {
    // Create incident if none exists
    const existingIncident = await store.openIncident(monitor.id);

    if (!existingIncident) {
      await store.createIncident({
        monitor_id: monitor.id,
        title: `${monitor.name} is down`,
        content: msg,
        status: INCIDENT_STATUS.OPEN,
        started_at: new Date().toISOString(),
      });
    }

    // Send DOWN notification
    try {
      await sendStatusNotification(
        monitor,
        {
          title: `🔴 ${monitor.name} is DOWN`,
          message: msg,
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "down",
          timestamp: new Date().toISOString(),
        },
        deadlineAt,
        dependencies,
      );
    } catch (error) {
      console.error(
        `[${monitor.name}] Failed to send DOWN notification:`,
        error,
      );
    }
  }

  if (isRecovery) {
    // Resolve open incidents
    await store.resolveIncidents(monitor.id);

    // Send UP notification
    try {
      await sendStatusNotification(
        monitor,
        {
          title: `✅ ${monitor.name} is UP`,
          message: "Service has recovered",
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "up",
          timestamp: new Date().toISOString(),
        },
        deadlineAt,
        dependencies,
      );
    } catch (error) {
      console.error(`[${monitor.name}] Failed to send UP notification:`, error);
    }
  }

  // Deliberately no incident: the service is answering, only slower than the
  // monitor tolerates. The alert tells a human to look; the outage machinery
  // stays for a service that stops answering altogether.
  if (isDegraded) {
    try {
      await sendStatusNotification(
        monitor,
        {
          title: `🟡 ${monitor.name} is DEGRADED`,
          message: msg,
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "degraded",
          timestamp: new Date().toISOString(),
        },
        deadlineAt,
        dependencies,
      );
    } catch (error) {
      console.error(
        `[${monitor.name}] Failed to send DEGRADED notification:`,
        error,
      );
    }
  }
}

/**
 * Check SSL certificate and update monitor record
 * Also sends notifications for expiring certificates
 */
async function checkAndUpdateSsl(
  monitor: Monitor,
  deadlineAt: number | undefined,
  dependencies: ProcessDependencies,
): Promise<void> {
  if (!monitor.url) return;

  try {
    assertBeforeDeadline(deadlineAt);
    const sslResult = await checkSslCertificate(monitor.url, dependencies.ssl);

    if (sslResult.success && sslResult.info) {
      const { info } = sslResult;

      // Get current SSL info from monitor to check if we need to send warning
      const recordedExpiry = await dependencies.store.sslExpiry(monitor.id);
      const previousExpiry = recordedExpiry ? new Date(recordedExpiry) : null;
      const previousDaysRemaining = previousExpiry
        ? Math.floor(
            (previousExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          )
        : undefined;

      // Update monitor with SSL info
      if (info.validTo && info.daysRemaining !== SSL_DAYS_REMAINING_UNKNOWN) {
        await dependencies.store.updateMonitor(monitor.id, {
          ssl_expiry: new Date(info.validTo).toISOString(),
          ssl_issuer: info.issuer,
        });
      }

      // Check if we should send SSL expiry warning (now only for actual expiration)
      if (
        info.daysRemaining !== SSL_DAYS_REMAINING_UNKNOWN &&
        info.daysRemaining < 0 &&
        shouldWarnSslExpiry(info.daysRemaining, previousDaysRemaining)
      ) {
        // Send SSL expiry warning notification
        try {
          await sendStatusNotification(
            monitor,
            {
              title: `🔴 SSL Certificate Expired: ${monitor.name}`,
              message: `Certificate has expired! (${info.daysRemaining} days ago, on ${info.validTo})`,
              monitorName: monitor.name,
              monitorUrl: monitor.url,
              status: info.daysRemaining <= 7 ? "down" : "degraded",
              timestamp: new Date().toISOString(),
            },
            deadlineAt,
            dependencies,
          );
        } catch (error) {
          console.error(`[${monitor.name}] Failed to send SSL warning:`, error);
        }
      }
    }
  } catch (error) {
    // SSL check failures are non-critical, just log
    console.error(`[${monitor.name}] SSL check failed:`, error);
  }
}
