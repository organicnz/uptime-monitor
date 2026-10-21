/* eslint-disable @typescript-eslint/no-explicit-any */
// Database Types - single source of truth, mirrors supabase/schema.sql.
// Canonical domain aliases live in types/application.ts - import Monitor,
// Heartbeat, etc. from there instead of redefining local copies so schema
// changes propagate everywhere and status drift cannot reoccur.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MonitorType =
  "http" | "tcp" | "ping" | "keyword" | "dns" | "docker" | "steam" | "advanced";

export type NotificationChannelType =
  "email" | "discord" | "slack" | "webhook" | "telegram" | "teams" | "pushover";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          timezone: string | null;
          last_check_at: string | null;
          created_at: string;
          updated_at: string;
          email_notifications: boolean;
          telegram_notifications: boolean;
          discord_notifications: boolean;
          slack_notifications: boolean;
          webhook_notifications: boolean;
          pushover_notifications: boolean;
          teams_notifications: boolean;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          last_check_at?: string | null;
          created_at?: string;
          updated_at?: string;
          email_notifications?: boolean;
          telegram_notifications?: boolean;
          discord_notifications?: boolean;
          slack_notifications?: boolean;
          webhook_notifications?: boolean;
          pushover_notifications?: boolean;
          teams_notifications?: boolean;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          last_check_at?: string | null;
          created_at?: string;
          updated_at?: string;
          email_notifications?: boolean;
          telegram_notifications?: boolean;
          discord_notifications?: boolean;
          slack_notifications?: boolean;
          webhook_notifications?: boolean;
          pushover_notifications?: boolean;
          teams_notifications?: boolean;
        };
        Relationships: any[];
      };
      monitors: {
        Row: {
          id: string;
          user_id: string;
          group_id: string | null;
          name: string;
          type: MonitorType;
          active: boolean;
          url: string | null;
          method: string | null;
          hostname: string | null;
          port: number | null;
          keyword: string | null;
          headers: Json | null;
          body: string | null;
          auth_method: string | null;
          auth_config: Json | null;
          interval: number;
          retry_interval: number;
          timeout: number;
          max_retries: number;
          ignore_tls: boolean;
          upside_down: boolean;
          packet_size: number;
          status: number;
          down_count: number;
          last_check_at: string | null;
          last_status_change_at: string | null;
          avg_response_time_ms: number;
          success_rate_percent: number;
          consecutive_uptime: number;
          description: string | null;
          parent_id: string | null;
          ssl_expiry: string | null;
          ssl_issuer: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          group_id?: string | null;
          name: string;
          type: MonitorType;
          active?: boolean;
          url?: string | null;
          method?: string | null;
          hostname?: string | null;
          port?: number | null;
          keyword?: string | null;
          headers?: Json | null;
          body?: string | null;
          auth_method?: string | null;
          auth_config?: Json | null;
          interval?: number;
          retry_interval?: number;
          timeout?: number;
          max_retries?: number;
          ignore_tls?: boolean;
          upside_down?: boolean;
          packet_size?: number;
          status?: number;
          down_count?: number;
          last_check_at?: string | null;
          last_status_change_at?: string | null;
          avg_response_time_ms?: number;
          success_rate_percent?: number;
          consecutive_uptime?: number;
          description?: string | null;
          parent_id?: string | null;
          ssl_expiry?: string | null;
          ssl_issuer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          group_id?: string | null;
          name?: string;
          type?: MonitorType;
          active?: boolean;
          url?: string | null;
          method?: string | null;
          hostname?: string | null;
          port?: number | null;
          keyword?: string | null;
          headers?: Json | null;
          body?: string | null;
          auth_method?: string | null;
          auth_config?: Json | null;
          interval?: number;
          retry_interval?: number;
          timeout?: number;
          max_retries?: number;
          ignore_tls?: boolean;
          upside_down?: boolean;
          packet_size?: number;
          status?: number;
          down_count?: number;
          last_check_at?: string | null;
          last_status_change_at?: string | null;
          avg_response_time_ms?: number;
          success_rate_percent?: number;
          consecutive_uptime?: number;
          description?: string | null;
          parent_id?: string | null;
          ssl_expiry?: string | null;
          ssl_issuer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: any[];
      };
      heartbeats: {
        Row: {
          id: string;
          monitor_id: string;
          status: number; // 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE, 4=DEGRADED
          msg: string | null;
          ping: number | null;
          duration: number | null;
          down_count: number | null;
          time: string;
          created_at: string;
          rtt_ms: number | null;
          ssl_valid: boolean;
          error_type: string | null;
          ip_resolved: string | null;
          status_reason: string | null;
          checked_by: string | null;
        };
        Insert: {
          id?: string;
          monitor_id: string;
          status: number;
          msg?: string | null;
          ping?: number | null;
          duration?: number | null;
          down_count?: number | null;
          time?: string;
          created_at?: string;
          rtt_ms?: number | null;
          ssl_valid?: boolean;
          error_type?: string | null;
          ip_resolved?: string | null;
          status_reason?: string | null;
          checked_by?: string | null;
        };
        Update: {
          id?: string;
          monitor_id?: string;
          status?: number;
          msg?: string | null;
          ping?: number | null;
          duration?: number | null;
          down_count?: number | null;
          time?: string;
          created_at?: string;
          rtt_ms?: number | null;
          ssl_valid?: boolean;
          error_type?: string | null;
          ip_resolved?: string | null;
          status_reason?: string | null;
          checked_by?: string | null;
        };
        Relationships: any[];
      };
      heartbeat_daily: {
        Row: {
          monitor_id: string;
          day: string;
          total_checks: number;
          up_checks: number;
          down_checks: number;
          degraded_checks: number;
          pending_checks: number;
          maintenance_checks: number;
          avg_ping: number | null;
          min_ping: number | null;
          max_ping: number | null;
        };
        Insert: {
          monitor_id: string;
          day: string;
          total_checks?: number;
          up_checks?: number;
          down_checks?: number;
          degraded_checks?: number;
          pending_checks?: number;
          maintenance_checks?: number;
          avg_ping?: number | null;
          min_ping?: number | null;
          max_ping?: number | null;
        };
        Update: {
          monitor_id?: string;
          day?: string;
          total_checks?: number;
          up_checks?: number;
          down_checks?: number;
          degraded_checks?: number;
          pending_checks?: number;
          maintenance_checks?: number;
          avg_ping?: number | null;
          min_ping?: number | null;
          max_ping?: number | null;
        };
        Relationships: any[];
      };
      cron_failures: {
        Row: {
          id: string;
          message_id: string;
          failed_url: string;
          failed_status: string | null;
          failed_message: string | null;
          retried: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          failed_url: string;
          failed_status?: string | null;
          failed_message?: string | null;
          retried?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          failed_url?: string;
          failed_status?: string | null;
          failed_message?: string | null;
          retried?: number;
          created_at?: string;
        };
        Relationships: any[];
      };
      incidents: {
        Row: {
          id: string;
          monitor_id: string;
          title: string;
          content: string | null;
          status: number; // 0=OPEN, 1=RESOLVED, 2=INVESTIGATING
          severity: string;
          source: string | null;
          started_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          acknowledgment_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          monitor_id: string;
          title: string;
          content?: string | null;
          status: number;
          severity?: string;
          source?: string | null;
          started_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          acknowledgment_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          monitor_id?: string;
          title?: string;
          content?: string | null;
          status?: number;
          severity?: string;
          source?: string | null;
          started_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          acknowledgment_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_monitor_id_fkey";
            columns: ["monitor_id"];
            referencedRelation: "monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_channels: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationChannelType;
          name: string;
          config: Json;
          secret_id: string | null;
          is_default: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationChannelType;
          name: string;
          config: Json;
          secret_id?: string | null;
          is_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: NotificationChannelType;
          name?: string;
          config?: Json;
          secret_id?: string | null;
          is_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: any[];
      };
      monitor_notifications: {
        Row: {
          id: string;
          monitor_id: string;
          channel_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          monitor_id: string;
          channel_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          monitor_id?: string;
          channel_id?: string;
          created_at?: string;
        };
        Relationships: any[];
      };
      maintenance: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          start_date: string;
          end_date: string;
          active: boolean;
          strategy: string | null;
          cron: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          start_date: string;
          end_date: string;
          active?: boolean;
          strategy?: string | null;
          cron?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          start_date?: string;
          end_date?: string;
          active?: boolean;
          strategy?: string | null;
          cron?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: any[];
      };
      maintenance_monitors: {
        Row: {
          id: string;
          maintenance_id: string;
          monitor_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          maintenance_id: string;
          monitor_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          maintenance_id?: string;
          monitor_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_monitors_monitor_id_fkey";
            columns: ["monitor_id"];
            referencedRelation: "monitors";
            referencedColumns: ["id"];
          },
        ];
      };

      monitor_groups: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          color: string;
          sort_order: number;
          collapsed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          color?: string;
          sort_order?: number;
          collapsed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          color?: string;
          sort_order?: number;
          collapsed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: any[];
      };
      status_pages: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          description: string | null;
          theme: string | null;
          custom_domain: string | null;
          is_public: boolean;
          show_tags: boolean;
          google_analytics_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          description?: string | null;
          theme?: string | null;
          custom_domain?: string | null;
          is_public?: boolean;
          show_tags?: boolean;
          google_analytics_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          description?: string | null;
          theme?: string | null;
          custom_domain?: string | null;
          is_public?: boolean;
          show_tags?: boolean;
          google_analytics_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: any[];
      };
      status_page_monitors: {
        Row: {
          id: string;
          status_page_id: string;
          monitor_id: string;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          status_page_id: string;
          monitor_id: string;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          status_page_id?: string;
          monitor_id?: string;
          display_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "status_page_monitors_monitor_id_fkey";
            columns: ["monitor_id"];
            referencedRelation: "monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id: string;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      retention_rollup_and_cleanup: {
        Args: {
          p_retention_days?: number;
          p_batch_size?: number;
          p_max_batches?: number;
        };
        Returns: Array<{
          rolled_up_days: number;
          deleted_rows: number;
        }>;
      };
      mfa_mutation_allowed: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      notification_channel_secret: {
        Args: { p_channel_id: string };
        Returns: Json | null;
      };
      notification_channel_secrets: {
        Args: { p_channel_ids: string[] };
        Returns: Array<{ out_channel_id: string; out_secret: Json }>;
      };
      notification_channel_set_secret: {
        Args: { p_channel_id: string; p_secret: Json };
        Returns: string | null;
      };
      notification_channel_clear_secret: {
        Args: { p_channel_id: string };
        Returns: undefined;
      };
      create_status_page_with_monitors: {
        Args: {
          p_title: string;
          p_slug: string;
          p_description: string | null;
          p_is_public: boolean;
          p_monitor_ids: string[];
        };
        Returns: string;
      };
      update_status_page_with_monitors: {
        Args: {
          p_status_page_id: string;
          p_title: string;
          p_slug: string;
          p_description: string | null;
          p_is_public: boolean;
          p_monitor_ids: string[];
        };
        Returns: string;
      };
      get_public_status_page: {
        Args: { p_slug: string };
        Returns: Array<{
          id: string;
          slug: string;
          title: string;
          description: string | null;
          custom_domain: string | null;
          monitor_id: string | null;
          monitor_name: string | null;
          monitor_type: string | null;
          display_order: number | null;
          status: number;
          ping: number | null;
        }>;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
