import { Database } from "./database";

// Database Helper Types
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// Core Domain Types
export type Monitor = Tables<"monitors">;
export type Heartbeat = Tables<"heartbeats">;
export type Incident = Tables<"incidents">;
export type StatusPage = Tables<"status_pages">;
export type StatusPageMonitor = Tables<"status_page_monitors">;
export type NotificationChannel = Tables<"notification_channels">;
export type MonitorNotification = Tables<"monitor_notifications">;

// Computed / Joined Types
export interface MonitorWithStatus extends Monitor {
  latest_heartbeat?: Heartbeat;
  status: number; // 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  latency?: number;
}

export interface StatusPageWithMonitors extends StatusPage {
  monitors: Monitor[];
}
