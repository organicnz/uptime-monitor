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

export type MonitorWithHistory = {
  monitorId: string;
  status: "up" | "down" | "pending";
  ping: number | null;
  uptimePercent: number;
  heartbeats: Heartbeat[];
};

/**
 * Hook to fetch monitors with their recent heartbeat history for sidebar display
 */
export function useMonitorsWithHistory(monitorIds: string[]) {
  const [monitors, setMonitors] = useState<Map<string, MonitorWithHistory>>(
    new Map(),
  );
  const [isConnected, setIsConnected] = useState(false);

  const calculateUptime = (heartbeats: Heartbeat[]) => {
    if (heartbeats.length === 0) return 100;
    const upCount = heartbeats.filter((h) => h.status === 1).length;
    return Math.round((upCount / heartbeats.length) * 100);
  };

  const updateMonitor = useCallback(
    (monitorId: string, heartbeat: Heartbeat) => {
      setMonitors((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(monitorId);
        const heartbeats = existing
          ? [heartbeat, ...existing.heartbeats.slice(0, 49)]
          : [heartbeat];

        newMap.set(monitorId, {
          monitorId,
          status:
            heartbeat.status === 1
              ? "up"
              : heartbeat.status === 0
                ? "down"
                : "pending",
          ping: heartbeat.ping,
          uptimePercent: calculateUptime(heartbeats),
          heartbeats,
        });
        return newMap;
      });
    },
    [],
  );

  useEffect(() => {
    if (monitorIds.length === 0) return;

    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    const fetchInitial = async () => {
      // Fetch last 50 heartbeats per monitor
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .in("monitor_id", monitorIds)
        .order("time", { ascending: false })
        .limit(monitorIds.length * 50);

      if (data) {
        const byMonitor = new Map<string, Heartbeat[]>();
        (data as Heartbeat[]).forEach((hb) => {
          const existing = byMonitor.get(hb.monitor_id) || [];
          if (existing.length < 50) {
            byMonitor.set(hb.monitor_id, [...existing, hb]);
          }
        });

        const newMonitors = new Map<string, MonitorWithHistory>();
        monitorIds.forEach((id) => {
          const heartbeats = byMonitor.get(id) || [];
          const latest = heartbeats[0];
          newMonitors.set(id, {
            monitorId: id,
            status: latest
              ? latest.status === 1
                ? "up"
                : latest.status === 0
                  ? "down"
                  : "pending"
              : "pending",
            ping: latest?.ping || null,
            uptimePercent: calculateUptime(heartbeats),
            heartbeats,
          });
        });
        setMonitors(newMonitors);
      }
    };

    const setupRealtime = async () => {
      channel = supabase
        .channel("monitors-history")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "heartbeats",
            filter: `monitor_id=in.(${monitorIds.join(",")})`,
          },
          (payload) => {
            const hb = payload.new as Heartbeat;
            updateMonitor(hb.monitor_id, hb);
          },
        )
        .subscribe((status) => {
          setIsConnected(status === "SUBSCRIBED");
        });
    };

    fetchInitial();
    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [monitorIds, updateMonitor]);

  return { monitors, isConnected };
}
