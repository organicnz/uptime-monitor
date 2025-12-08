// Database Types (Auto-generated from Supabase)
export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string
                    full_name: string | null
                    avatar_url: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    email: string
                    full_name?: string | null
                    avatar_url?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    email?: string
                    full_name?: string | null
                    avatar_url?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            monitors: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    type: 'http' | 'tcp' | 'ping' | 'keyword'
                    url: string
                    method: string
                    interval: number
                    timeout: number
                    headers: Json | null
                    body: string | null
                    expected_status: number[]
                    keyword: string | null
                    active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    type: 'http' | 'tcp' | 'ping' | 'keyword'
                    url: string
                    method?: string
                    interval?: number
                    timeout?: number
                    headers?: Json | null
                    body?: string | null
                    expected_status?: number[]
                    keyword?: string | null
                    active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    type?: 'http' | 'tcp' | 'ping' | 'keyword'
                    url?: string
                    method?: string
                    interval?: number
                    timeout?: number
                    headers?: Json | null
                    body?: string | null
                    expected_status?: number[]
                    keyword?: string | null
                    active?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            monitor_checks: {
                Row: {
                    id: string
                    monitor_id: string
                    status: 'up' | 'down' | 'degraded'
                    response_time: number
                    status_code: number | null
                    error_message: string | null
                    checked_at: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    monitor_id: string
                    status: 'up' | 'down' | 'degraded'
                    response_time: number
                    status_code?: number | null
                    error_message?: string | null
                    checked_at?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    monitor_id?: string
                    status?: 'up' | 'down' | 'degraded'
                    response_time?: number
                    status_code?: number | null
                    error_message?: string | null
                    checked_at?: string
                    created_at?: string
                }
            }
            incidents: {
                Row: {
                    id: string
                    monitor_id: string
                    status: 'ongoing' | 'resolved'
                    started_at: string
                    resolved_at: string | null
                    notification_sent: boolean
                    created_at: string
                }
                Insert: {
                    id?: string
                    monitor_id: string
                    status?: 'ongoing' | 'resolved'
                    started_at?: string
                    resolved_at?: string | null
                    notification_sent?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    monitor_id?: string
                    status?: 'ongoing' | 'resolved'
                    started_at?: string
                    resolved_at?: string | null
                    notification_sent?: boolean
                    created_at?: string
                }
            }
            status_pages: {
                Row: {
                    id: string
                    user_id: string
                    slug: string
                    title: string
                    description: string
                    custom_domain: string | null
                    is_public: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    slug: string
                    title: string
                    description: string
                    custom_domain?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    slug?: string
                    title?: string
                    description?: string
                    custom_domain?: string | null
                    is_public?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
            status_page_monitors: {
                Row: {
                    id: string
                    status_page_id: string
                    monitor_id: string
                    display_order: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    status_page_id: string
                    monitor_id: string
                    display_order?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    status_page_id?: string
                    monitor_id?: string
                    display_order?: number
                    created_at?: string
                }
            }
            notification_channels: {
                Row: {
                    id: string
                    user_id: string
                    type: 'email' | 'discord' | 'slack' | 'webhook' | 'telegram'
                    name: string
                    config: Json
                    active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    type: 'email' | 'discord' | 'slack' | 'webhook' | 'telegram'
                    name: string
                    config: Json
                    active?: boolean
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    type?: 'email' | 'discord' | 'slack' | 'webhook' | 'telegram'
                    name?: string
                    config?: Json
                    active?: boolean
                    created_at?: string
                    updated_at?: string
                }
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
