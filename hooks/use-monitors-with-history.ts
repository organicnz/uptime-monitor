"use client";

import { useEffect, useState, useCallback, useId } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { mapHeartbeatStatus } from "@/hooks/use-realtime-monitors";

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
  status: "up" | "down" | "pending" | "degraded" | "maintenance";
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
  const instanceId = useId().replace(/:/g, "");

  // Derived each render (cheap string op for typical list sizes); the
  // subscription effect below only re-runs when the key actually changes.
  const idsKey = [...new Set(monitorIds)].sort().join(",");

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
          status: mapHeartbeatStatus(heartbeat.status),
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
    if (!idsKey) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const channelName = `monitors-history-${instanceId}`;
    const supabase = createClient();
    const ids = idsKey.split(",");

    const init = async () => {
      // Fetch last 50 heartbeats per monitor
      const { data } = await supabase
        .from("heartbeats")
        .select("*")
        .in("monitor_id", ids)
        .order("time", { ascending: false })
        .limit(ids.length * 50);

      if (cancelled) return;

      if (data) {
        const byMonitor = new Map<string, Heartbeat[]>();
        (data as Heartbeat[]).forEach((hb) => {
          const existing = byMonitor.get(hb.monitor_id) || [];
          if (existing.length < 50) {
            byMonitor.set(hb.monitor_id, [...existing, hb]);
          }
        });

        const newMonitors = new Map<string, MonitorWithHistory>();
        ids.forEach((id) => {
          const heartbeats = byMonitor.get(id) || [];
          const latest = heartbeats[0];
          newMonitors.set(id, {
            monitorId: id,
            status: latest ? mapHeartbeatStatus(latest.status) : "pending",
            ping: latest?.ping || null,
            uptimePercent: calculateUptime(heartbeats),
            heartbeats,
          });
        });
        setMonitors(newMonitors);
      }

      if (cancelled) return;

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
            const hb = payload.new as Heartbeat;
            updateMonitor(hb.monitor_id, hb);
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
  }, [idsKey, instanceId, updateMonitor]);

  return { monitors, isConnected };
}
