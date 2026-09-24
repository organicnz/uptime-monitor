import { connect } from "node:net";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyMonitor } from "@/lib/notifications";
import {
  fetchWithSsrfProtection,
  resolveAndValidateHost,
  formatHostForUrl,
} from "@/lib/security";
import {
  checkSslCertificate,
  shouldWarnSslExpiry,
  SSL_DAYS_REMAINING_UNKNOWN,
} from "@/lib/ssl-utils";

import type { Heartbeat, Monitor } from "@/types/application";
import {
  determineEffectiveStatus,
  HEARTBEAT_STATUS,
} from "@/lib/monitor-status";

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

type CheckResult = {
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
};

type PreviousHeartbeat = Pick<Heartbeat, "status" | "down_count">;

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
 * Perform an HTTP/HTTPS monitor check
 */
async function checkHttp(
  monitor: Monitor,
  deadlineAt?: number,
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

  let ping: number | null = null;
  let msg = "";

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...(monitor.headers as Record<string, string> | null),
    };

    const { controller, clear } = createTimeoutController(timeout, deadlineAt);

    try {
      const response = await fetchWithSsrfProtection(monitor.url, {
        method: monitor.method || "GET",
        headers,
        body: monitor.body || undefined,
        signal: controller.signal,
      });

      let responseText: string | undefined;
      if (monitor.type === "keyword" && monitor.keyword) {
        responseText = await readResponseText(response);
      }

      ping = Date.now() - startTime;

      if (monitor.type === "keyword" && monitor.keyword) {
        const keywordFound = responseText!.includes(monitor.keyword);
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

      const isSuccess = monitor.upside_down ? !response.ok : response.ok;

      msg = `${response.status} - ${response.statusText}`;

      // Enrich message for common blocking scenarios
      if (response.status === 429 || response.status === 403) {
        const server = response.headers.get("server")?.toLowerCase() || "";
        const mitigated = response.headers.get("x-vercel-mitigated");

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

  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port });
    const timeoutId = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout after ${timeoutSeconds}s`));
    }, effectiveTimeout * 1_000);

    socket.once("connect", () => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeoutId);
      socket.destroy();
      reject(error);
    });
  });
}

/**
 * Perform a TCP monitor check using actual TCP connection
 */
async function checkTcp(
  monitor: Monitor,
  deadlineAt?: number,
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

  let safeHostname = monitor.hostname;
  try {
    safeHostname = await resolveAndValidateHost(monitor.hostname);
  } catch (error) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: `SSRF Blocked: ${(error as Error).message}`,
    };
  }

  let ping: number | null = null;
  let success = false;
  let msg = "";

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

  let safeHostname = monitor.hostname;
  try {
    // If it's a URL in ping (rare, but possible due to UI), parse out the hostname
    const hostToResolve = monitor.hostname.startsWith("http")
      ? new URL(monitor.hostname).hostname
      : monitor.hostname;

    safeHostname = await resolveAndValidateHost(hostToResolve);
  } catch (error) {
    return {
      status: HEARTBEAT_STATUS.DOWN,
      ping: null,
      msg: `SSRF Blocked: ${(error as Error).message}`,
    };
  }

  let ping: number | null = null;
  let isReachable = false;
  let success = false;
  let msg = "";

  try {
    const url = monitor.hostname?.startsWith("http")
      ? new URL(monitor.hostname)
      : new URL(`https://${formatHostForUrl(safeHostname)}`);
    if (monitor.hostname?.startsWith("http")) {
      url.hostname = safeHostname;
    }

    const { controller, clear } = createTimeoutController(timeout, deadlineAt);

    try {
      const response = await fetchWithSsrfProtection(url.toString(), {
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
 */
async function checkDns(
  monitor: Monitor,
  deadlineAt?: number,
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

    const response = await fetch(
      `https://dns.google/resolve?name=${encodedHostname}&type=A`,
      { signal: controller.signal },
    );
    const data: {
      Status: number;
      Answer?: Array<{ data: string }>;
    } = await response.json();
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
export async function checkMonitor(
  monitor: Monitor,
  deadlineAt?: number,
): Promise<CheckResult> {
  switch (monitor.type) {
    case "http":
    case "keyword":
      return checkHttp(monitor, deadlineAt);
    case "tcp":
      return checkTcp(monitor, deadlineAt);
    case "ping":
      return checkPing(monitor, deadlineAt);
    case "dns":
      return checkDns(monitor, deadlineAt);
    default:
      return {
        status: HEARTBEAT_STATUS.PENDING,
        ping: null,
        msg: `Unsupported monitor type: ${monitor.type}`,
      };
  }
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
 * 6. Supports DEGRADED status for warning thresholds
 */
export async function processMonitorCheck(
  monitor: Monitor,
  deadlineAt?: number,
): Promise<void> {
  const supabase = createServiceClient();
  assertBeforeDeadline(deadlineAt);
  const checkStartTime = Date.now();

  // Check maintenance status first
  const inMaintenance = await isUnderMaintenance(supabase, monitor.id);
  if (inMaintenance) {
    assertBeforeDeadline(deadlineAt);
    const checkedAt = new Date().toISOString();
    await recordHeartbeat(supabase, {
      monitor_id: monitor.id,
      status: HEARTBEAT_STATUS.MAINTENANCE,
      msg: "Under maintenance",
      ping: null,
      duration: 0,
      down_count: 0,
      time: checkedAt,
    });
    const { error: maintenanceUpdateError } = await supabase
      .from("monitors")
      .update({
        status: HEARTBEAT_STATUS.MAINTENANCE,
        down_count: 0,
        last_check_at: checkedAt,
        ...(monitor.status !== HEARTBEAT_STATUS.MAINTENANCE && {
          last_status_change_at: checkedAt,
        }),
      })
      .eq("id", monitor.id);
    if (maintenanceUpdateError) {
      throw new Error(
        `Failed to update maintenance state: ${maintenanceUpdateError.message}`,
      );
    }
    return;
  }

  // Get previous heartbeat for down_count tracking
  const previousHeartbeat = await getPreviousHeartbeat(supabase, monitor.id);
  const previousDownCount = previousHeartbeat?.down_count ?? 0;
  const previousStatus = previousHeartbeat?.status ?? null;

  // Perform the actual check
  const result = await checkMonitor(monitor, deadlineAt);
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

  await recordHeartbeat(supabase, {
    monitor_id: monitor.id,
    status: effectiveStatus,
    msg: result.msg,
    ping: result.ping,
    duration,
    down_count: downCount,
    time: checkedAt,
  });

  const { error: monitorUpdateError } = await supabase
    .from("monitors")
    .update({
      status: effectiveStatus,
      down_count: downCount,
      last_check_at: checkedAt,
      ...(effectiveStatus !== previousStatus && {
        last_status_change_at: checkedAt,
      }),
    })
    .eq("id", monitor.id);

  if (monitorUpdateError) {
    throw new Error(
      `Failed to update monitor state: ${monitorUpdateError.message}`,
    );
  }

  // SSL Certificate check for HTTPS monitors (runs periodically, not every check)
  if (
    (monitor.type === "http" || monitor.type === "keyword") &&
    monitor.url?.startsWith("https://") &&
    (deadlineAt === undefined || deadlineAt - Date.now() > 10_000)
  ) {
    await checkAndUpdateSsl(supabase, monitor, deadlineAt);
  }

  // Handle notifications only on actual status changes
  // and only when we've exceeded retry threshold
  if (effectiveStatus !== previousStatus) {
    await handleStatusChange(
      supabase,
      monitor,
      previousStatus,
      effectiveStatus,
      result.msg,
      deadlineAt,
    );
  }
}

async function getPreviousHeartbeat(
  supabase: ReturnType<typeof createServiceClient>,
  monitorId: string,
): Promise<PreviousHeartbeat | null> {
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

  return data as PreviousHeartbeat | null;
}

/**
 * Check if monitor is under maintenance
 */
async function isUnderMaintenance(
  supabase: ReturnType<typeof createServiceClient>,
  monitorId: string,
): Promise<boolean> {
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
      maintenance: { active: boolean; start_date: string; end_date: string };
    }>
  ).some((item) => {
    const m = item.maintenance;
    return m?.active && m.start_date <= now && m.end_date >= now;
  });
}

/**
 * Record heartbeat (Uptime Kuma style)
 */
async function recordHeartbeat(
  supabase: ReturnType<typeof createServiceClient>,
  heartbeat: HeartbeatInsert,
): Promise<void> {
  const { error } = await supabase.from("heartbeats").insert(heartbeat);
  if (error) {
    throw new Error(`Failed to record heartbeat: ${error.message}`);
  }
}

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
  deadlineAt?: number,
): Promise<void> {
  const remaining =
    deadlineAt === undefined
      ? 5_000
      : Math.min(5_000, Math.max(1, deadlineAt - Date.now()));
  const result = await withTimeout(
    notifyMonitor(monitor.id, monitor.user_id, payload, deadlineAt),
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
  supabase: ReturnType<typeof createServiceClient>,
  monitor: Monitor,
  previousStatus: number | null,
  currentStatus: number,
  msg: string,
  deadlineAt?: number,
): Promise<void> {
  assertBeforeDeadline(deadlineAt);
  // No change or first heartbeat with UP status - no notification needed
  if (previousStatus === currentStatus) return;
  if (previousStatus === null && currentStatus === HEARTBEAT_STATUS.UP) return;

  const isDown = currentStatus === HEARTBEAT_STATUS.DOWN;
  const isRecovery =
    (previousStatus === HEARTBEAT_STATUS.DOWN ||
      previousStatus === HEARTBEAT_STATUS.MAINTENANCE) &&
    currentStatus === HEARTBEAT_STATUS.UP;
  const isDegraded =
    currentStatus === HEARTBEAT_STATUS.DEGRADED &&
    previousStatus !== HEARTBEAT_STATUS.DOWN;

  if (isDown) {
    // Create incident if none exists
    const { data: existingIncident, error: incidentLookupError } =
      await supabase
        .from("incidents")
        .select("id")
        .eq("monitor_id", monitor.id)
        .eq("status", INCIDENT_STATUS.OPEN)
        .limit(1)
        .maybeSingle();

    if (incidentLookupError) {
      throw new Error(
        `Failed to check existing incidents: ${incidentLookupError.message}`,
      );
    }

    if (!existingIncident) {
      const { error: incidentInsertError } = await supabase
        .from("incidents")
        .insert({
          monitor_id: monitor.id,
          title: `${monitor.name} is down`,
          content: msg,
          status: INCIDENT_STATUS.OPEN,
          started_at: new Date().toISOString(),
        });

      if (incidentInsertError) {
        throw new Error(
          `Failed to create incident: ${incidentInsertError.message}`,
        );
      }
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
    const { error: resolveIncidentError } = await supabase
      .from("incidents")
      .update({
        status: INCIDENT_STATUS.RESOLVED,
        resolved_at: new Date().toISOString(),
      })
      .eq("monitor_id", monitor.id)
      .eq("status", INCIDENT_STATUS.OPEN);

    if (resolveIncidentError) {
      throw new Error(
        `Failed to resolve incidents: ${resolveIncidentError.message}`,
      );
    }

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
      );
    } catch (error) {
      console.error(`[${monitor.name}] Failed to send UP notification:`, error);
    }
  }

  // Handle DEGRADED status notifications
  if (isDegraded) {
    try {
      await sendStatusNotification(
        monitor,
        {
          title: `⚠️ ${monitor.name} is DEGRADED`,
          message: msg || "Service is experiencing issues",
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "degraded",
          timestamp: new Date().toISOString(),
        },
        deadlineAt,
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
  supabase: ReturnType<typeof createServiceClient>,
  monitor: Monitor,
  deadlineAt?: number,
): Promise<void> {
  if (!monitor.url) return;

  try {
    assertBeforeDeadline(deadlineAt);
    const sslResult = await checkSslCertificate(monitor.url);

    if (sslResult.success && sslResult.info) {
      const { info } = sslResult;

      // Get current SSL info from monitor to check if we need to send warning
      const { data: currentMonitor, error: currentMonitorError } =
        await supabase
          .from("monitors")
          .select("ssl_expiry")
          .eq("id", monitor.id)
          .maybeSingle();

      if (currentMonitorError) {
        throw new Error(
          `Failed to read SSL state: ${currentMonitorError.message}`,
        );
      }

      const monitorData = currentMonitor as {
        ssl_expiry: string | null;
      } | null;
      const previousExpiry = monitorData?.ssl_expiry
        ? new Date(monitorData.ssl_expiry)
        : null;
      const previousDaysRemaining = previousExpiry
        ? Math.floor(
            (previousExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
          )
        : undefined;

      // Update monitor with SSL info
      if (info.validTo && info.daysRemaining !== SSL_DAYS_REMAINING_UNKNOWN) {
        const { error: updateError } = await supabase
          .from("monitors")
          .update({
            ssl_expiry: new Date(info.validTo).toISOString(),
            ssl_issuer: info.issuer,
          })
          .eq("id", monitor.id);
        if (updateError) {
          throw new Error(`Failed to update SSL state: ${updateError.message}`);
        }
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
