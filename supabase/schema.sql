-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table (User accounts)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create monitors table (Enhanced for Uptime Kuma parity)
CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'ping', 'keyword', 'dns', 'docker', 'steam')),
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
  
  -- Meta
  description TEXT,
  parent_id UUID REFERENCES monitors(id), -- For grouped monitors
  
  -- SSL Info
  ssl_expiry TIMESTAMPTZ,
  ssl_issuer TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create heartbeats table (Renamed from monitor_checks to match Uptime Kuma)
CREATE TABLE IF NOT EXISTS heartbeats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status SMALLINT NOT NULL, -- 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE
  msg TEXT, -- Error message or simple "OK"
  ping INTEGER, -- Response time in ms
  duration INTEGER, -- Total duration in ms
  down_count INTEGER DEFAULT 0, -- Consecutive downs? (Optional helper)
  time TIMESTAMPTZ DEFAULT NOW(), -- Time of check
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create incidents table (For persistent outages)
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

-- Create notification_channels table
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

-- Create monitor_notifications junction table (Per-monitor notifications)
CREATE TABLE IF NOT EXISTS monitor_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id, channel_id)
);

-- Create maintenance table
CREATE TABLE IF NOT EXISTS maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  active BOOLEAN DEFAULT true,
  strategy TEXT DEFAULT 'manual', -- manual, single, recurring
  cron TEXT, -- For recurring
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create maintenance_monitors junction table
CREATE TABLE IF NOT EXISTS maintenance_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  maintenance_id UUID NOT NULL REFERENCES maintenance(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(maintenance_id, monitor_id)
);

-- Create status_pages table
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

-- Create status_page_monitors junction table
CREATE TABLE IF NOT EXISTS status_page_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(status_page_id, monitor_id)
);


-- Indexes
CREATE INDEX IF NOT EXISTS idx_monitors_user_id ON monitors(user_id);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors(active);
CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
CREATE INDEX IF NOT EXISTS idx_heartbeats_time ON heartbeats(time DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeats_status ON heartbeats(status);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_id ON incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_monitor_notifs_monitor_id ON monitor_notifications(monitor_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_active ON maintenance(active);

-- Updated At Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
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

-- User Signup Handler
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

-- Enable RLS
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

-- Simple RLS Policies (Owner Access)
-- Profiles
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Monitors
CREATE POLICY "Users can view own monitors" ON monitors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own monitors" ON monitors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own monitors" ON monitors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own monitors" ON monitors FOR DELETE USING (auth.uid() = user_id);

-- Heartbeats (View own, System inserts)
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
