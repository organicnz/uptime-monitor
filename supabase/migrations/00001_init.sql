-- Uptime Monitor - Initial Schema
-- This migration sets up all tables, indexes, RLS policies, and triggers
-- Run this in your Supabase SQL editor for a new project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Profiles (User accounts)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitor Groups
CREATE TABLE IF NOT EXISTS monitor_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  collapsed BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitors
CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES monitor_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'ping', 'keyword', 'dns', 'docker', 'steam')),
  active BOOLEAN DEFAULT true,

  -- Request Config
  url TEXT,
  method TEXT DEFAULT 'GET',
  hostname TEXT,
  port INTEGER,
  keyword TEXT,
  headers JSONB,
  body TEXT,
  auth_method TEXT,
  auth_config JSONB,

  -- Advanced Config
  interval INTEGER DEFAULT 60,
  retry_interval INTEGER DEFAULT 60,
  timeout INTEGER DEFAULT 48,
  max_retries INTEGER DEFAULT 1,
  ignore_tls BOOLEAN DEFAULT false,
  upside_down BOOLEAN DEFAULT false,
  packet_size INTEGER DEFAULT 56,

  -- SSL Info
  ssl_expiry TIMESTAMPTZ,
  ssl_issuer TEXT,

  -- Meta
  description TEXT,
  parent_id UUID REFERENCES monitors(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heartbeats (Monitor checks)
CREATE TABLE IF NOT EXISTS heartbeats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status SMALLINT NOT NULL, -- 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  msg TEXT,
  ping INTEGER,
  duration INTEGER,
  down_count INTEGER DEFAULT 0,
  time TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  status SMALLINT NOT NULL, -- 0=OPEN, 1=RESOLVED, 2=INVESTIGATING
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notification Channels
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'discord', 'slack', 'webhook', 'telegram', 'teams', 'pushover')),
  config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monitor Notifications (junction)
CREATE TABLE IF NOT EXISTS monitor_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id, channel_id)
);

-- Maintenance Windows
CREATE TABLE IF NOT EXISTS maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  active BOOLEAN DEFAULT true,
  strategy TEXT DEFAULT 'manual',
  cron TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance Monitors (junction)
CREATE TABLE IF NOT EXISTS maintenance_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_id UUID NOT NULL REFERENCES maintenance(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(maintenance_id, monitor_id)
);

-- Status Pages
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

-- Status Page Monitors (junction)
CREATE TABLE IF NOT EXISTS status_page_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(status_page_id, monitor_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_group_id ON monitors(group_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active);
CREATE INDEX IF NOT EXISTS idx_monitor_groups_user_id ON monitor_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_time ON heartbeats(time DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_monitor_notifs_monitor_id ON monitor_notifications(monitor_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_active ON maintenance(active);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_monitors_updated_at ON monitors;
CREATE TRIGGER update_monitors_updated_at BEFORE UPDATE ON monitors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_monitor_groups_updated_at ON monitor_groups;
CREATE TRIGGER update_monitor_groups_updated_at BEFORE UPDATE ON monitor_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_channels_updated_at ON notification_channels;
CREATE TRIGGER update_notification_channels_updated_at BEFORE UPDATE ON notification_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_updated_at ON maintenance;
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_status_pages_updated_at ON status_pages;
CREATE TRIGGER update_status_pages_updated_at BEFORE UPDATE ON status_pages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Signup Handler (auto-create profile)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_monitors ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Monitor Groups
CREATE POLICY "Users can view own groups" ON monitor_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own groups" ON monitor_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own groups" ON monitor_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own groups" ON monitor_groups FOR DELETE USING (auth.uid() = user_id);

-- Monitors
CREATE POLICY "Users can view own monitors" ON monitors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monitors" ON monitors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monitors" ON monitors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monitors" ON monitors FOR DELETE USING (auth.uid() = user_id);

-- Heartbeats
CREATE POLICY "Users view own monitor heartbeats" ON heartbeats FOR SELECT USING (
  EXISTS (SELECT 1 FROM monitors WHERE monitors.id = heartbeats.monitor_id AND monitors.user_id = auth.uid())
);
CREATE POLICY "System insert heartbeats" ON heartbeats FOR INSERT WITH CHECK (true);

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

-- Maintenance
CREATE POLICY "Users can view own maintenance" ON maintenance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own maintenance" ON maintenance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own maintenance" ON maintenance FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own maintenance" ON maintenance FOR DELETE USING (auth.uid() = user_id);

-- Maintenance Monitors
CREATE POLICY "Users can view own maintenance monitors" ON maintenance_monitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM maintenance WHERE maintenance.id = maintenance_monitors.maintenance_id AND maintenance.user_id = auth.uid())
);
CREATE POLICY "Users can manage own maintenance monitors" ON maintenance_monitors FOR ALL USING (
  EXISTS (SELECT 1 FROM maintenance WHERE maintenance.id = maintenance_monitors.maintenance_id AND maintenance.user_id = auth.uid())
);

-- Status Pages
CREATE POLICY "Users can view own status pages" ON status_pages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Public can view public status pages" ON status_pages FOR SELECT USING (is_public = true);
CREATE POLICY "Users can insert own status pages" ON status_pages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own status pages" ON status_pages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own status pages" ON status_pages FOR DELETE USING (auth.uid() = user_id);

-- Status Page Monitors
CREATE POLICY "Users can view own status page monitors" ON status_page_monitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM status_pages WHERE status_pages.id = status_page_monitors.status_page_id AND status_pages.user_id = auth.uid())
);
CREATE POLICY "Public can view public status page monitors" ON status_page_monitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM status_pages WHERE status_pages.id = status_page_monitors.status_page_id AND status_pages.is_public = true)
);
CREATE POLICY "Users can manage own status page monitors" ON status_page_monitors FOR ALL USING (
  EXISTS (SELECT 1 FROM status_pages WHERE status_pages.id = status_page_monitors.status_page_id AND status_pages.user_id = auth.uid())
);
