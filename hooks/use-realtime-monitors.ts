"use client";

import { useEffect, useState, useCallback } from "react";
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
  status: "up" | "down" | "pending";
  ping: number | null;
  lastCheck: string | null;
  message: string | null;
};

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

  const updateStatus = useCallback((heartbeat: Heartbeat) => {
    setStatuses((prev) => {
      const newMap = new Map(prev);
      newMap.set(heartbeat.monitor_id, {
        monitorId: heartbeat.monitor_id,
        status:
          heartbeat.status === 1
            ? "up"
            : heartbeat.status === 0
              ? "down"
              : "pending",
        ping: heartbeat.ping,
        lastCheck: heartbeat.time,
        message: heartbeat.msg,
      });
      return newMap;
    });
    setLastUpdate(new Date());
  }, []);

  useEffect(() => {
    if (monitorIds.length === 0) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    const setupRealtimeSubscription = async () => {
      // Subscribe to heartbeats table for inserts
      channel = supabase
        .channel("heartbeats-realtime")
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
            updateStatus(heartbeat);
          },
        )
        .subscribe((status) => {
          setIsConnected(status === "SUBSCRIBED");
        });
    };

    // Fetch initial statuses
    const fetchInitialStatuses = async () => {
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .in("monitor_id", monitorIds)
        .order("time", { ascending: false });

      if (data) {
        const latestByMonitor = new Map<string, Heartbeat>();
        data.forEach((hb: Heartbeat) => {
          if (!latestByMonitor.has(hb.monitor_id)) {
            latestByMonitor.set(hb.monitor_id, hb);
          }
        });

        latestByMonitor.forEach((hb) => updateStatus(hb));
      }
    };

    fetchInitialStatuses();
    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [monitorIds, updateStatus]);

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

  useEffect(() => {
    if (!monitorId) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    const setupSubscription = async () => {
      channel = supabase
        .channel(`monitor-${monitorId}`)
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
            setHeartbeats((prev) => [heartbeat, ...prev.slice(0, 99)]);
            setCurrentStatus({
              monitorId: heartbeat.monitor_id,
              status:
                heartbeat.status === 1
                  ? "up"
                  : heartbeat.status === 0
                    ? "down"
                    : "pending",
              ping: heartbeat.ping,
              lastCheck: heartbeat.time,
              message: heartbeat.msg,
            });
          },
        )
        .subscribe((status) => {
          setIsConnected(status === "SUBSCRIBED");
        });
    };

    // Fetch initial heartbeats
    const fetchInitial = async () => {
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .eq("monitor_id", monitorId)
        .order("time", { ascending: false })
        .limit(100);

      if (data && data.length > 0) {
        setHeartbeats(data as Heartbeat[]);
        const latest = data[0] as Heartbeat;
        setCurrentStatus({
          monitorId: latest.monitor_id,
          status:
            latest.status === 1
              ? "up"
              : latest.status === 0
                ? "down"
                : "pending",
          ping: latest.ping,
          lastCheck: latest.time,
          message: latest.msg,
        });
      }
    };

    fetchInitial();
    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [monitorId]);

  return { heartbeats, currentStatus, isConnected };
}
