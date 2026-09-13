"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type Heartbeat = {
  id: string;
  monitor_id: string;
  status: number;
  ping: number | null;
  msg: string | null;
  time: string;
};

export type MonitorStatus = {
  monitorId: string;
  status: "up" | "down" | "pending" | "degraded" | "maintenance";
  ping: number | null;
  lastCheck: string | null;
  message: string | null;
};

/**
 * Map a numeric heartbeat status to a display status.
 * 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE, 4=DEGRADED
 */
export function mapHeartbeatStatus(status: number): MonitorStatus["status"] {
  switch (status) {
    case 1:
      return "up";
    case 0:
      return "down";
    case 4:
      return "degraded";
    case 3:
      return "maintenance";
    default:
      return "pending";
  }
}

/**
 * Hook to subscribe to real-time heartbeat updates for monitors
 * Uses Supabase Realtime (WebSocket) for live updates
 */
export function useRealtimeMonitors(monitorIds: string[]) {
  const [statuses, setStatuses] = useState<Map<string, MonitorStatus>>(
    new Map(),
  );
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const instanceId = useId().replace(/:/g, "");

  // Derived each render (cheap string op for typical list sizes); the
  // subscription effect below only re-runs when the key actually changes.
  const idsKey = [...new Set(monitorIds)].sort().join(",");

  const updateStatus = useCallback((heartbeat: Heartbeat) => {
    setStatuses((prev) => {
      const newMap = new Map(prev);
      newMap.set(heartbeat.monitor_id, {
        monitorId: heartbeat.monitor_id,
        status: mapHeartbeatStatus(heartbeat.status),
        ping: heartbeat.ping,
        lastCheck: heartbeat.time,
        message: heartbeat.msg,
      });
      return newMap;
    });
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    if (!idsKey) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const channelName = `heartbeats-realtime-${instanceId}`;
    const supabase = createClient();
    const ids = idsKey.split(",");

    const init = async () => {
      // Fetch initial statuses
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .in("monitor_id", ids)
        .order("time", { ascending: false });

      if (cancelled) return;

      if (data) {
        const latestByMonitor = new Map<string, Heartbeat>();
        (data as Heartbeat[]).forEach((hb: Heartbeat) => {
          if (!latestByMonitor.has(hb.monitor_id)) {
            latestByMonitor.set(hb.monitor_id, hb);
          }
        });

        latestByMonitor.forEach((hb) => updateStatus(hb));
      }

      if (cancelled) return;

      // Subscribe to heartbeats table for inserts.
      // NOTE: .on() must be called before .subscribe() on a fresh channel.
      // The per-instance channel name guarantees no other hook instance has
      // already subscribed this channel object.
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "heartbeats",
            filter: `monitor_id=in.(${idsKey})`,
          },
          (payload) => {
            const heartbeat = payload.new as Heartbeat;
            updateStatus(heartbeat);
          },
        )
        .subscribe((status) => {
          if (!cancelled) {
            setIsConnected(status === "SUBSCRIBED");
          }
        });

      if (cancelled && channel) {
        const stale = channel;
        channel = null;
        supabase.removeChannel(stale);
      }
    };

    void init();

    return () => {
      cancelled = true;
      setIsConnected(false);
      if (channel) {
        supabase.removeChannel(channel);
      } else {
        // Subscription setup may still be in flight; remove by name once it
        // resolves. Best-effort cleanup to avoid leaked channels.
        const pending = supabase.channel(channelName);
        supabase.removeChannel(pending);
      }
    };
  }, [idsKey, instanceId, updateStatus]);

  return { statuses, isConnected, lastUpdate };
}

/**
 * Hook to subscribe to a single monitor's heartbeats
 */
export function useRealtimeMonitor(monitorId: string) {
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [currentStatus, setCurrentStatus] = useState<MonitorStatus | null>(
    null,
  );
  const [isConnected, setIsConnected] = useState(false);
  const instanceId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!monitorId) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const channelName = `monitor-${monitorId}-${instanceId}`;
    const supabase = createClient();

    const handleHeartbeat = (heartbeat: Heartbeat) => {
      setHeartbeats((prev) => [heartbeat, ...prev.slice(0, 99)]);
      setCurrentStatus({
        monitorId: heartbeat.monitor_id,
        status: mapHeartbeatStatus(heartbeat.status),
        ping: heartbeat.ping,
        lastCheck: heartbeat.time,
        message: heartbeat.msg,
      });
    };

    const init = async () => {
      // Fetch initial heartbeats
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .eq("monitor_id", monitorId)
        .order("time", { ascending: false })
        .limit(100);

      if (cancelled) return;

      if (data && data.length > 0) {
        const rows = data as Heartbeat[];
        setHeartbeats(rows);
        const latest = rows[0];
        setCurrentStatus({
          monitorId: latest.monitor_id,
          status: mapHeartbeatStatus(latest.status),
          ping: latest.ping,
          lastCheck: latest.time,
          message: latest.msg,
        });
      }

      if (cancelled) return;

      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "heartbeats",
            filter: `monitor_id=eq.${monitorId}`,
          },
          (payload) => {
            const heartbeat = payload.new as Heartbeat;
            handleHeartbeat(heartbeat);
          },
        )
        .subscribe((status) => {
          if (!cancelled) {
            setIsConnected(status === "SUBSCRIBED");
          }
        });

      if (cancelled && channel) {
        const stale = channel;
        channel = null;
        supabase.removeChannel(stale);
      }
    };

    void init();

    return () => {
      cancelled = true;
      setIsConnected(false);
      if (channel) {
        supabase.removeChannel(channel);
      } else {
        const pending = supabase.channel(channelName);
        supabase.removeChannel(pending);
      }
    };
  }, [monitorId, instanceId]);

  return { heartbeats, currentStatus, isConnected };
}
