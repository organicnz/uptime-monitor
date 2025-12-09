import { createServiceClient } from "@/lib/supabase/service";
import { notifyUser } from "@/lib/notifications";

// Status constants (matching Uptime Kuma)
export const HEARTBEAT_STATUS = {
  DOWN: 0,
  UP: 1,
  PENDING: 2,
  MAINTENANCE: 3,
} as const;

export const INCIDENT_STATUS = {
  OPEN: 0,
  RESOLVED: 1,
  INVESTIGATING: 2,
} as const;

// Config
const DEFAULT_TIMEOUT_SECONDS = 48;
const USER_AGENT = "Uptime-Monitor/1.0";

// Types
type Monitor = {
  id: string;
  user_id: string;
  name: string;
  type: "http" | "tcp" | "ping" | "keyword" | "dns" | "docker" | "steam";
  url: string | null;
  hostname: string | null;
  port: number | null;
  method: string | null;
  keyword: string | null;
  headers: Record<string, string> | null;
  body: string | null;
  interval: number;
  retry_interval: number;
  timeout: number;
  max_retries: number;
  ignore_tls: boolean;
  upside_down: boolean;
  active: boolean;
};

type Heartbeat = {
  id: string;
  monitor_id: string;
  status: number;
  msg: string | null;
  ping: number | null;
  duration: number | null;
  down_count: number;
  time: string;
};

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

// Timeout helper
function createTimeoutController(timeoutSeconds: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  return { controller, clear: () => clearTimeout(timeoutId) };
}

// HTTP/HTTPS check
async function checkHttp(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  const { controller, clear } = createTimeoutController(timeout);

  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...(monitor.headers || {}),
    };

    const response = await fetch(monitor.url!, {
      method: monitor.method || "GET",
      headers,
      body: monitor.body || undefined,
      signal: controller.signal,
      redirect: "follow",
    });

    clear();
    const ping = Date.now() - startTime;

    // Keyword check
    if (monitor.type === "keyword" && monitor.keyword) {
      const text = await response.text();
      const keywordFound = text.includes(monitor.keyword);
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

    // HTTP status check
    const isSuccess = monitor.upside_down ? !response.ok : response.ok;

    return {
      status: isSuccess ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: `${response.status} - ${response.statusText}`,
    };
  } catch (error) {
    clear();
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

// TCP check (simplified - uses HTTP HEAD as proxy in serverless)
async function checkTcp(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  const { controller, clear } = createTimeoutController(timeout);

  try {
    const url = `http://${monitor.hostname}:${monitor.port}`;
    await fetch(url, { method: "HEAD", signal: controller.signal });
    clear();

    const ping = Date.now() - startTime;
    const success = !monitor.upside_down;

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: success
        ? "Connection successful"
        : "Connection successful (upside down)",
    };
  } catch (error) {
    clear();
    const ping = Date.now() - startTime;
    const success = monitor.upside_down;

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
}

// Ping check (uses HTTP HEAD as substitute in serverless)
async function checkPing(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  const { controller, clear } = createTimeoutController(timeout);

  try {
    const url = monitor.hostname?.startsWith("http")
      ? monitor.hostname
      : `https://${monitor.hostname}`;

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clear();

    const ping = Date.now() - startTime;
    const isReachable = response.ok || response.status < 500;
    const success = monitor.upside_down ? !isReachable : isReachable;

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: `${ping}ms`,
    };
  } catch (error) {
    clear();
    const ping = Date.now() - startTime;
    const success = monitor.upside_down;

    return {
      status: success ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: error instanceof Error ? error.message : "Host unreachable",
    };
  }
}

// DNS check
type DnsResponse = {
  Status: number;
  Answer?: Array<{ data: string }>;
};

async function checkDns(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();
  const timeout = monitor.timeout || DEFAULT_TIMEOUT_SECONDS;
  const { controller, clear } = createTimeoutController(timeout);

  try {
    const response = await fetch(
      `https://dns.google/resolve?name=${monitor.hostname}&type=A`,
      { signal: controller.signal },
    );
    clear();

    const data: DnsResponse = await response.json();
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

    return {
      status: monitor.upside_down ? HEARTBEAT_STATUS.UP : HEARTBEAT_STATUS.DOWN,
      ping,
      msg: error instanceof Error ? error.message : "DNS query failed",
    };
  }
}

// Main check dispatcher
export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  switch (monitor.type) {
    case "http":
    case "keyword":
      return checkHttp(monitor);
    case "tcp":
      return checkTcp(monitor);
    case "ping":
      return checkPing(monitor);
    case "dns":
      return checkDns(monitor);
    default:
      return {
        status: HEARTBEAT_STATUS.PENDING,
        ping: null,
        msg: `Unsupported monitor type: ${monitor.type}`,
      };
  }
}

// Get previous heartbeat for a monitor
async function getPreviousHeartbeat(
  supabase: ReturnType<typeof createServiceClient>,
  monitorId: string,
): Promise<Heartbeat | null> {
  const { data } = await supabase
    .from("heartbeats")
    .select("*")
    .eq("monitor_id", monitorId)
    .order("time", { ascending: false })
    .limit(1)
    .single();

  return data as Heartbeat | null;
}

// Check if monitor is under maintenance
async function isUnderMaintenance(
  supabase: ReturnType<typeof createServiceClient>,
  monitorId: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  const { data } = await supabase
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

// Record heartbeat (Uptime Kuma style)
async function recordHeartbeat(
  supabase: ReturnType<typeof createServiceClient>,
  heartbeat: HeartbeatInsert,
): Promise<void> {
  await supabase.from("heartbeats").insert(heartbeat as unknown as never);
}

// Handle status change notifications and incidents
async function handleStatusChange(
  supabase: ReturnType<typeof createServiceClient>,
  monitor: Monitor,
  previousStatus: number | null,
  currentStatus: number,
  msg: string,
): Promise<void> {
  // No change or first heartbeat with UP status - no notification needed
  if (previousStatus === currentStatus) return;
  if (previousStatus === null && currentStatus === HEARTBEAT_STATUS.UP) return;

  const isDown = currentStatus === HEARTBEAT_STATUS.DOWN;
  const isRecovery =
    previousStatus === HEARTBEAT_STATUS.DOWN &&
    currentStatus === HEARTBEAT_STATUS.UP;

  if (isDown) {
    // Create incident if none exists
    const { data: existingIncident } = await supabase
      .from("incidents")
      .select("id")
      .eq("monitor_id", monitor.id)
      .eq("status", INCIDENT_STATUS.OPEN)
      .limit(1)
      .single();

    if (!existingIncident) {
      await supabase.from("incidents").insert({
        monitor_id: monitor.id,
        title: `${monitor.name} is down`,
        content: msg,
        status: INCIDENT_STATUS.OPEN,
        started_at: new Date().toISOString(),
      } as unknown as never);
    }

    // Send DOWN notification
    try {
      await notifyUser(monitor.user_id, {
        title: `🔴 ${monitor.name} is DOWN`,
        message: msg,
        monitorName: monitor.name,
        monitorUrl: monitor.url || monitor.hostname || undefined,
        status: "down",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(
        `[${monitor.name}] Failed to send DOWN notification:`,
        error,
      );
    }
  }

  if (isRecovery) {
    // Resolve open incidents
    await supabase
      .from("incidents")
      .update({
        status: INCIDENT_STATUS.RESOLVED,
        resolved_at: new Date().toISOString(),
      } as unknown as never)
      .eq("monitor_id", monitor.id)
      .eq("status", INCIDENT_STATUS.OPEN);

    // Send UP notification
    try {
      await notifyUser(monitor.user_id, {
        title: `✅ ${monitor.name} is UP`,
        message: "Service has recovered",
        monitorName: monitor.name,
        monitorUrl: monitor.url || monitor.hostname || undefined,
        status: "up",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[${monitor.name}] Failed to send UP notification:`, error);
    }
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
 */
export async function processMonitorCheck(monitor: Monitor): Promise<void> {
  const supabase = createServiceClient();
  const checkStartTime = Date.now();

  // Check maintenance status first
  const inMaintenance = await isUnderMaintenance(supabase, monitor.id);
  if (inMaintenance) {
    await recordHeartbeat(supabase, {
      monitor_id: monitor.id,
      status: HEARTBEAT_STATUS.MAINTENANCE,
      msg: "Under maintenance",
      ping: null,
      duration: 0,
      down_count: 0,
      time: new Date().toISOString(),
    });
    return;
  }

  // Get previous heartbeat for down_count tracking
  const previousHeartbeat = await getPreviousHeartbeat(supabase, monitor.id);
  const previousDownCount = previousHeartbeat?.down_count ?? 0;
  const previousStatus = previousHeartbeat?.status ?? null;

  // Perform the actual check
  const result = await checkMonitor(monitor);
  const duration = Date.now() - checkStartTime;

  // Calculate new down_count and effective status (Uptime Kuma logic)
  let downCount = 0;
  let effectiveStatus = result.status;

  if (result.status === HEARTBEAT_STATUS.DOWN) {
    downCount = previousDownCount + 1;

    // Only mark as DOWN after max_retries consecutive failures
    // Until then, keep previous status (or PENDING if first check)
    if (downCount <= monitor.max_retries) {
      effectiveStatus = previousStatus ?? HEARTBEAT_STATUS.PENDING;
    }
  }

  // Record the heartbeat
  await recordHeartbeat(supabase, {
    monitor_id: monitor.id,
    status: effectiveStatus,
    msg: result.msg,
    ping: result.ping,
    duration,
    down_count: downCount,
    time: new Date().toISOString(),
  });

  // Handle notifications only on actual status changes
  // and only when we've exceeded retry threshold
  if (effectiveStatus !== previousStatus) {
    await handleStatusChange(
      supabase,
      monitor,
      previousStatus,
      effectiveStatus,
      result.msg,
    );
  }

  console.log(
    `[${monitor.name}] ${effectiveStatus === HEARTBEAT_STATUS.UP ? "UP" : effectiveStatus === HEARTBEAT_STATUS.DOWN ? "DOWN" : "PENDING"} - ${result.msg} (${result.ping}ms, down_count: ${downCount})`,
  );
}
