import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { MonitorDetailClient } from "@/components/monitor-detail-client";

export default async function MonitorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  type Monitor = {
    id: string;
    user_id: string;
    name: string;
    type: string;
    url: string | null;
    hostname: string | null;
    port: number | null;
    method: string | null;
    interval: number;
    timeout: number;
    max_retries: number;
    active: boolean;
    description: string | null;
    created_at: string;
    updated_at: string;
  };

  const { data: monitorData } = await supabase
    .from("monitors")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!monitorData) {
    notFound();
  }

  const monitor = monitorData as Monitor;

  type Heartbeat = {
    id: string;
    monitor_id: string;
    status: number;
    msg: string | null;
    ping: number | null;
    duration: number | null;
    time: string;
  };

  const { data: heartbeatsData } = await supabase
    .from("heartbeats")
    .select("*")
    .eq("monitor_id", id)
    .order("time", { ascending: false })
    .limit(100);

  const heartbeats = (heartbeatsData || []) as Heartbeat[];

  type Incident = {
    id: string;
    monitor_id: string;
    title: string;
    content: string | null;
    status: number;
    started_at: string;
    resolved_at: string | null;
  };

  const { data: incidentsData } = await supabase
    .from("incidents")
    .select("*")
    .eq("monitor_id", id)
    .eq("status", 0)
    .order("started_at", { ascending: false });

  const activeIncidents = (incidentsData || []) as Incident[];

  return (
    <MonitorDetailClient
      monitor={monitor}
      initialHeartbeats={heartbeats}
      activeIncidents={activeIncidents}
    />
  );
}
