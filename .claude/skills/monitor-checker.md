# Monitor Checker

## Check Logic Location

`lib/monitor-checker.ts` - Core monitoring logic

## Monitor Types

```typescript
type MonitorType = "http" | "tcp" | "ping" | "keyword" | "dns";

async function checkMonitor(monitor: Monitor): Promise<HeartbeatResult> {
  switch (monitor.type) {
    case "http":
      return checkHttp(monitor);
    case "tcp":
      return checkTcp(monitor);
    case "ping":
      return checkPing(monitor);
    case "keyword":
      return checkKeyword(monitor);
    case "dns":
      return checkDns(monitor);
  }
}
```

## Heartbeat Result

```typescript
type HeartbeatResult = {
  status: 0 | 1 | 2 | 3; // DOWN, UP, PENDING, MAINTENANCE
  msg: string;
  ping: number; // Response time in ms
  duration: number; // Total check duration in ms
};
```

## HTTP Check Example

```typescript
async function checkHttp(monitor: Monitor): Promise<HeartbeatResult> {
  const start = Date.now();

  try {
    const response = await fetch(monitor.url!, {
      method: monitor.method || "GET",
      headers: monitor.headers || {},
      signal: AbortSignal.timeout(monitor.timeout * 1000),
    });

    const ping = Date.now() - start;
    const isUp = response.ok;

    return {
      status: isUp ? 1 : 0,
      msg: isUp
        ? `${response.status} OK`
        : `${response.status} ${response.statusText}`,
      ping,
      duration: ping,
    };
  } catch (error) {
    return {
      status: 0,
      msg: error instanceof Error ? error.message : "Unknown error",
      ping: 0,
      duration: Date.now() - start,
    };
  }
}
```

## Cron Integration

The cron endpoint (`app/api/cron/check-monitors/route.ts`) fetches active monitors and runs checks using service role client.
