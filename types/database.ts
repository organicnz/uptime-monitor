// Database Types (Auto-generated representation of current schema)
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      monitors: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          type:
            | "http"
            | "tcp"
            | "ping"
            | "keyword"
            | "dns"
            | "docker"
            | "steam";
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
          name: string;
          type:
            | "http"
            | "tcp"
            | "ping"
            | "keyword"
            | "dns"
            | "docker"
            | "steam";
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
          name?: string;
          type?:
            | "http"
            | "tcp"
            | "ping"
            | "keyword"
            | "dns"
            | "docker"
            | "steam";
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
          description?: string | null;
          parent_id?: string | null;
          ssl_expiry?: string | null;
          ssl_issuer?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      heartbeats: {
        Row: {
          id: string;
          monitor_id: string;
          status: number; // 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
          msg: string | null;
          ping: number | null;
          duration: number | null;
          down_count: number | null;
          time: string;
          created_at: string;
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
        };
      };
      incidents: {
        Row: {
          id: string;
          monitor_id: string;
          title: string;
          content: string | null;
          status: number; // 0=OPEN, 1=RESOLVED, 2=INVESTIGATING
          started_at: string;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          monitor_id: string;
          title: string;
          content?: string | null;
          status: number;
          started_at?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          monitor_id?: string;
          title?: string;
          content?: string | null;
          status?: number;
          started_at?: string;
          resolved_at?: string | null;
          created_at?: string;
        };
      };
      notification_channels: {
        Row: {
          id: string;
          user_id: string;
          type:
            | "email"
            | "discord"
            | "slack"
            | "webhook"
            | "telegram"
            | "teams"
            | "pushover";
          name: string;
          config: Json;
          is_default: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type:
            | "email"
            | "discord"
            | "slack"
            | "webhook"
            | "telegram"
            | "teams"
            | "pushover";
          name: string;
          config: Json;
          is_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type:
            | "email"
            | "discord"
            | "slack"
            | "webhook"
            | "telegram"
            | "teams"
            | "pushover";
          name?: string;
          config?: Json;
          is_default?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
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
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
