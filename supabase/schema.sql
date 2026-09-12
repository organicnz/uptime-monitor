-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES TABLE - User accounts with notification preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  last_check_at TIMESTAMPTZ, -- Last monitor check timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Email preferences
  email_notifications BOOLEAN DEFAULT true,
  telegram_notifications BOOLEAN DEFAULT false,
  discord_notifications BOOLEAN DEFAULT false,
  slack_notifications BOOLEAN DEFAULT false,
  webhook_notifications BOOLEAN DEFAULT false,
  pushover_notifications BOOLEAN DEFAULT false,
  teams_notifications BOOLEAN DEFAULT false
);

-- Index for profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================================
-- MONITORS TABLE - Enhanced for Uptime Kuma parity + analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'ping', 'keyword', 'dns', 'docker', 'steam', 'advanced')),
  active BOOLEAN DEFAULT true,
  
  -- Request Config
  url TEXT, -- For HTTP, keyword
  method TEXT DEFAULT 'GET',
  hostname TEXT, -- For TCP, Ping, DNS
  port INTEGER, -- For TCP
  keyword TEXT, -- For Keyword monitor
  headers JSONB, -- Custom headers
  body TEXT, -- Request body
  auth_method TEXT, -- basic, oauth, etc.
  auth_config JSONB,
  
  -- Advanced Config
  interval INTEGER DEFAULT 60, -- Check interval in seconds
  retry_interval INTEGER DEFAULT 60, -- Interval when down
  timeout INTEGER DEFAULT 48, -- Request timeout
  max_retries INTEGER DEFAULT 1, -- Retries before down
  ignore_tls BOOLEAN DEFAULT false,
  upside_down BOOLEAN DEFAULT false, -- Invert status logic (e.g. 404 is UP)
  packet_size INTEGER DEFAULT 56, -- For Ping
  
  -- Status Tracking
  status INTEGER DEFAULT 1, -- 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  down_count INTEGER DEFAULT 0, -- Consecutive downs
  last_check_at TIMESTAMPTZ, -- Time of last check
  last_status_change_at TIMESTAMPTZ, -- Time of last status change
  
  -- Advanced: AI/Analytics fields
  avg_response_time_ms INTEGER DEFAULT 0,
  success_rate_percent INTEGER DEFAULT 100,
  consecutive_uptime INTEGER DEFAULT 0,
  
  -- Meta
  description TEXT,
  parent_id UUID REFERENCES monitors(id), -- For grouped monitors
  
  -- SSL Info
  ssl_expiry TIMESTAMPTZ,
  ssl_issuer TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for monitor performance and querying
CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active);
CREATE INDEX IF NOT EXISTS idx_monitors_type ON monitors(type);
CREATE INDEX IF NOT EXISTS idx_monitors_status ON monitors(status);
CREATE INDEX IF NOT EXISTS idx_monitors_last_check ON monitors(last_check_at);
CREATE INDEX IF NOT EXISTS idx_monitors_parent_id ON monitors(parent_id);
CREATE INDEX IF NOT EXISTS idx_monitors_type_active ON monitors(type, active);

-- ============================================================
-- HEARTBEATS TABLE - Renamed from monitor_checks to match Uptime Kuma
-- With enhanced analytics and error tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS heartbeats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status SMALLINT NOT NULL, -- 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  msg TEXT, -- Error message or simple "OK"
  ping INTEGER, -- Response time in ms
  duration INTEGER, -- Total duration in ms
  down_count INTEGER DEFAULT 0, -- Consecutive downs? (Optional helper)
  time TIMESTAMPTZ DEFAULT NOW(), -- Time of check
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Enhanced analytics fields
  rtt_ms INTEGER, -- Round trip time for this check
  ssl_valid BOOLEAN DEFAULT false, -- SSL certificate validity
  error_type TEXT, -- Type of error (timeout, dns_failure, etc.)
  ip_resolved INET, -- IP address that was checked
  status_reason TEXT, -- Human-readable reason for status
  
  -- Audit fields
  checked_by UUID REFERENCES auth.users(id) -- Who triggered this check (for manual checks)
);

-- Indexes for heartbeat performance and querying
CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_time ON heartbeats(time DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status);
CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_time ON heartbeats(monitor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_error_type ON heartbeats(error_type);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ssl_valid ON heartbeats(ssl_valid);

-- ============================================================
-- INCIDENTS TABLE - For persistent outages with severity tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  status SMALLINT NOT NULL, -- 0=OPEN, 1=RESOLVED, 2=INVESTIGATING
  severity TEXT DEFAULT 'medium', -- low, medium, high, critical
  source TEXT, -- e.g., "monitor_check", "manual", "ssl_expiry"
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id), -- Who resolved the incident
  acknowledgment_at TIMESTAMPTZ, -- When someone acknowledged the incident
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for incident performance and querying
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source);

-- ============================================================
-- NOTIFICATION CHANNELS TABLE - Per-user notification configurations
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'discord', 'slack', 'webhook', 'telegram', 'teams', 'pushover')),
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false, -- Send for all new monitors?
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for channel lookups
CREATE INDEX IF NOT EXISTS idx_notification_channels_user_id ON notification_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(type);
CREATE INDEX IF NOT EXISTS idx_notification_channels_active ON notification_channels(active);

-- ============================================================
-- MONITOR NOTIFICATIONS TABLE - Per-monitor channel associations
-- ============================================================
CREATE TABLE IF NOT EXISTS monitor_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id, channel_id)
);

-- Index for monitor-notification lookups
CREATE INDEX IF NOT EXISTS idx_monitor_notifs_monitor_id ON monitor_notifications(monitor_id);

-- ============================================================
-- MAINTENANCE TABLE - Maintenance windows for monitors
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  active BOOLEAN DEFAULT true,
  strategy TEXT DEFAULT 'manual', -- manual, single, recurring
  cron TEXT, -- For recurring maintenance windows
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for maintenance lookups
CREATE INDEX IF NOT EXISTS idx_maintenance_active ON maintenance(active);
CREATE INDEX IF NOT EXISTS idx_maintenance_dates ON maintenance(start_date, end_date);

-- ============================================================
-- MAINTENANCE MONITORS TABLE - Monitors affected by maintenance
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_id UUID NOT NULL REFERENCES maintenance(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(maintenance_id, monitor_id)
);

-- Index for maintenance-monitor lookups
CREATE INDEX IF NOT EXISTS idx_maintenance_monitors_monitor_id ON maintenance_monitors(monitor_id);

-- ============================================================
-- STATUS PAGES TABLE - Public status pages
-- ============================================================
CREATE TABLE IF NOT EXISTS status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  theme TEXT DEFAULT 'auto',
  custom_domain TEXT,
  is_public BOOLEAN DEFAULT true,
  show_tags BOOLEAN DEFAULT false,
  google_analytics_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status page lookups
CREATE INDEX IF NOT EXISTS idx_status_pages_user_id ON status_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_status_pages_slug ON status_pages(slug);

-- ============================================================
-- STATUS PAGE MONITORS TABLE - Monitors displayed on status pages
-- ============================================================
CREATE TABLE IF NOT EXISTS status_page_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(status_page_id, monitor_id)
);

-- Index for status-page-monitor lookups
CREATE INDEX IF NOT EXISTS idx_status_page_monitors_monitor_id ON status_page_monitors(monitor_id);

-- ============================================================
-- TRIGGERS - Auto-update timestamps
-- ============================================================

-- Updated At Trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables with updated_at columns
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_monitors_updated_at ON monitors;
CREATE TRIGGER update_monitors_updated_at BEFORE UPDATE ON monitors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_channels_updated_at ON notification_channels;
CREATE TRIGGER update_notification_channels_updated_at BEFORE UPDATE ON notification_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_updated_at ON maintenance;
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_status_pages_updated_at ON status_pages;
CREATE TRIGGER update_status_pages_updated_at BEFORE UPDATE ON status_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- USER SIGNUP HANDLER - Auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auth Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_monitors ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES - Owner Access Only (simplified pattern)
-- ============================================================

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Monitors
CREATE POLICY "Users can view own monitors" ON monitors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monitors" ON monitors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monitors" ON monitors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monitors" ON monitors FOR DELETE USING (auth.uid() = user_id);

-- Heartbeats (View own, System inserts via service role)
CREATE POLICY "Users view own monitor heartbeats" ON heartbeats FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = heartbeats.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "System insert heartbeats" ON heartbeats FOR INSERT WITH CHECK (true); -- Requires Service Role

-- Notification Channels
CREATE POLICY "Users can view own channels" ON notification_channels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own channels" ON notification_channels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own channels" ON notification_channels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own channels" ON notification_channels FOR DELETE USING (auth.uid() = user_id);

-- Monitor Notifications
CREATE POLICY "Users can view own monitor notifs" ON monitor_notifications FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = monitor_notifications.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "Users can manage own monitor notifs" ON monitor_notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = monitor_notifications.monitor_id AND monitors.user_id = auth.uid())
);

-- Incidents
CREATE POLICY "Users can view own incidents" ON incidents FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = incidents.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "Users can insert own incidents" ON incidents FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = incidents.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "Users can update own incidents" ON incidents FOR UPDATE USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = incidents.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "Users can delete own incidents" ON incidents FOR DELETE USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = incidents.monitor_id AND monitors.user_id = auth.uid())
);

-- Maintenance
CREATE POLICY "Users can view own maintenance" ON maintenance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own maintenance" ON maintenance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own maintenance" ON maintenance FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own maintenance" ON maintenance FOR DELETE USING (auth.uid() = user_id);

-- Maintenance Monitors
CREATE POLICY "Users can view own maintenance monitors" ON maintenance_monitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = maintenance_monitors.monitor_id AND monitors.user_id = auth.uid())
);

-- Status Pages
CREATE POLICY "Users can view own status pages" ON status_pages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own status pages" ON status_pages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own status pages" ON status_pages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own status pages" ON status_pages FOR DELETE USING (auth.uid() = user_id);

-- Status Page Monitors
CREATE POLICY "Users can view own status page monitors" ON status_page_monitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = status_page_monitors.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "Users can manage own status page monitors" ON status_page_monitors FOR ALL USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = status_page_monitors.monitor_id AND monitors.user_id = auth.uid())
);