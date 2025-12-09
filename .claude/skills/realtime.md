# Realtime Patterns

## Hook Pattern

```typescript
// hooks/use-realtime-monitors.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Heartbeat = {
  id: string;
  monitor_id: string;
  status: number;
  ping: number;
  time: string;
};

export function useRealtimeMonitors(monitorIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, Heartbeat>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (monitorIds.length === 0) return;

    const supabase = createClient();
    const channel = supabase
      .channel("heartbeats")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "heartbeats",
          filter: `monitor_id=in.(${monitorIds.join(",")})`,
        },
        (payload) => {
          const heartbeat = payload.new as Heartbeat;
          setStatuses((prev) => ({
            ...prev,
            [heartbeat.monitor_id]: heartbeat,
          }));
        },
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [monitorIds]);

  return { statuses, isConnected };
}
```

## Usage in Component

```tsx
"use client";

import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { Wifi, WifiOff } from "lucide-react";

export function LiveMonitorsList({ monitors }: Props) {
  const ids = monitors.map((m) => m.id);
  const { statuses, isConnected } = useRealtimeMonitors(ids);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        {isConnected ? (
          <>
            <Wifi className="h-4 w-4 text-green-400" /> Live
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" /> Connecting...
          </>
        )}
      </div>
      {monitors.map((monitor) => {
        const latest = statuses[monitor.id];
        // render with latest status
      })}
    </div>
  );
}
```

## Channel Cleanup

Always remove channels on unmount to prevent memory leaks:

```typescript
return () => {
  supabase.removeChannel(channel);
};
```
