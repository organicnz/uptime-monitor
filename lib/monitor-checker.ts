import { createClient as createServerClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notifications";

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
  interval: number;
  timeout: number;
  max_retries: number;
  active: boolean;
};

type CheckResult = {
  success: boolean;
  ping: number | null;
  message: string;
  status: number; // 0=DOWN, 1=UP, 2=PENDING
};

// HTTP/HTTPS Monitor Check
export async function checkHttpMonitor(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      (monitor.timeout || 48) * 1000,
    );

    const response = await fetch(monitor.url!, {
      method: monitor.method || "GET",
      headers: {
        "User-Agent": "Uptime-Monitor/1.0",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    const ping = Date.now() - startTime;

    // Check if status code is successful (2xx or 3xx)
    const isSuccess =
      response.ok || (response.status >= 200 && response.status < 400);

    // For keyword monitors, also check content
    if (monitor.type === "keyword" && monitor.keyword) {
      const text = await response.text();
      const hasKeyword = text.includes(monitor.keyword);

      if (!hasKeyword) {
        return {
          success: false,
          ping,
          message: `Keyword "${monitor.keyword}" not found in response`,
          status: 0,
        };
      }
    }

    return {
      success: isSuccess,
      ping,
      message: isSuccess
        ? `HTTP ${response.status}`
        : `HTTP ${response.status} ${response.statusText}`,
      status: isSuccess ? 1 : 0,
    };
  } catch (error) {
    const ping = Date.now() - startTime;

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          ping,
          message: `Timeout after ${monitor.timeout}s`,
          status: 0,
        };
      }

      return {
        success: false,
        ping,
        message: error.message,
        status: 0,
      };
    }

    return {
      success: false,
      ping,
      message: "Unknown error",
      status: 0,
    };
  }
}

// TCP Port Check (using HTTP request as proxy since pure TCP requires different runtime)
export async function checkTcpMonitor(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Note: In serverless environments, we can't do raw TCP connections
    // This is a simplified check using HTTP as a proxy
    // For production, consider using a dedicated monitoring service or edge function
    const url = `http://${monitor.hostname}:${monitor.port}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      (monitor.timeout || 48) * 1000,
    );

    await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const ping = Date.now() - startTime;

    return {
      success: true,
      ping,
      message: "Port is open",
      status: 1,
    };
  } catch (error) {
    const ping = Date.now() - startTime;

    return {
      success: false,
      ping,
      message:
        error instanceof Error
          ? error.message
          : "Port is closed or unreachable",
      status: 0,
    };
  }
}

// Ping Check (using HTTP HEAD as substitute)
export async function checkPingMonitor(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Use HTTP HEAD request as a ping substitute
    // Note: This is not a true ICMP ping, but works in serverless environments
    const url = monitor.hostname?.startsWith("http")
      ? monitor.hostname
      : `https://${monitor.hostname}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      (monitor.timeout || 48) * 1000,
    );

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const ping = Date.now() - startTime;

    return {
      success: response.ok,
      ping,
      message: `Reachable (${ping}ms)`,
      status: response.ok ? 1 : 0,
    };
  } catch (error) {
    const ping = Date.now() - startTime;

    return {
      success: false,
      ping,
      message: error instanceof Error ? error.message : "Host unreachable",
      status: 0,
    };
  }
}

// DNS Check
export async function checkDnsMonitor(monitor: Monitor): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    // Use a DNS-over-HTTPS provider
    const response = await fetch(
      `https://dns.google/resolve?name=${monitor.hostname}&type=A`,
    );

    const data = await response.json();
    const ping = Date.now() - startTime;

    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return {
        success: true,
        ping,
        message: `Resolved to ${data.Answer[0].data}`,
        status: 1,
      };
    }

    return {
      success: false,
      ping,
      message: "DNS resolution failed",
      status: 0,
    };
  } catch (error) {
    const ping = Date.now() - startTime;

    return {
      success: false,
      ping,
      message: error instanceof Error ? error.message : "DNS query failed",
      status: 0,
    };
  }
}

// Main check function
export async function checkMonitor(monitor: Monitor): Promise<CheckResult> {
  switch (monitor.type) {
    case "http":
    case "keyword":
      return checkHttpMonitor(monitor);
    case "tcp":
      return checkTcpMonitor(monitor);
    case "ping":
      return checkPingMonitor(monitor);
    case "dns":
      return checkDnsMonitor(monitor);
    default:
      return {
        success: false,
        ping: null,
        message: `Unsupported monitor type: ${monitor.type}`,
        status: 2,
      };
  }
}

// Process monitor check with retry logic and incident management
export async function processMonitorCheck(monitor: Monitor): Promise<void> {
  const supabase = await createServerClient();
  let attempts = 0;
  let lastResult: CheckResult | null = null;

  // Perform check with retries
  while (attempts <= monitor.max_retries) {
    lastResult = await checkMonitor(monitor);

    if (lastResult.success) {
      break;
    }

    attempts++;
    if (attempts <= monitor.max_retries) {
      // Wait a bit before retry (exponential backoff)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000 * Math.pow(2, attempts), 10000)),
      );
    }
  }

  if (!lastResult) return;

  // Record heartbeat
  // @ts-expect-error - Supabase types show as 'never'
  await supabase.from("heartbeats").insert({
    monitor_id: monitor.id,
    status: lastResult.status,
    msg: lastResult.message,
    ping: lastResult.ping,
    time: new Date().toISOString(),
  });

  // Handle incidents
  if (!lastResult.success) {
    // Check if there's already an open incident
    const { data: existingIncidents } = await supabase
      .from("incidents")
      .select("*")
      .eq("monitor_id", monitor.id)
      .eq("status", 0) // 0 = OPEN
      .order("started_at", { ascending: false })
      .limit(1);

    // Create new incident if none exists
    if (!existingIncidents || existingIncidents.length === 0) {
      // @ts-expect-error - Supabase types show as 'never'
      await supabase.from("incidents").insert({
        monitor_id: monitor.id,
        title: `${monitor.name} is down`,
        content: lastResult.message,
        status: 0, // OPEN
        started_at: new Date().toISOString(),
      });

      // Send notifications
      try {
        await notifyUser(monitor.user_id, {
          title: `🔴 ${monitor.name} is Down`,
          message: lastResult.message,
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "down",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    }
  } else {
    // Monitor is up - close any open incidents
    const { data: openIncidents } = await supabase
      .from("incidents")
      .select("*")
      .eq("monitor_id", monitor.id)
      .eq("status", 0) // OPEN
      .order("started_at", { ascending: false });

    if (openIncidents && openIncidents.length > 0) {
      // Close all open incidents
      await supabase
        .from("incidents")
        .update({
          status: 1, // RESOLVED
          resolved_at: new Date().toISOString(),
        } as unknown as never)
        .eq("monitor_id", monitor.id)
        .eq("status", 0);

      // Send recovery notification
      try {
        await notifyUser(monitor.user_id, {
          title: `✅ ${monitor.name} is Back Online`,
          message: "Service has recovered and is operational",
          monitorName: monitor.name,
          monitorUrl: monitor.url || monitor.hostname || undefined,
          status: "up",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    }
  }
}
