-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create monitors table
CREATE TABLE monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('http', 'tcp', 'ping', 'keyword')),
  url TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  interval INTEGER DEFAULT 60,
  timeout INTEGER DEFAULT 30,
  headers JSONB,
  body TEXT,
  expected_status INTEGER[] DEFAULT ARRAY[200],
  keyword TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create monitor_checks table
CREATE TABLE monitor_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'degraded')),
  response_time INTEGER NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create incidents table
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing', 'resolved')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create status_pages table
CREATE TABLE status_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  custom_domain TEXT,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create status_page_monitors junction table
CREATE TABLE status_page_monitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status_page_id UUID NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(status_page_id, monitor_id)
);

-- Create notification_channels table
CREATE TABLE notification_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('email', 'discord', 'slack', 'webhook', 'telegram')),
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_monitors_user_id ON monitors(user_id);
CREATE INDEX idx_monitors_active ON monitors(active);
CREATE INDEX idx_monitor_checks_monitor_id ON monitor_checks(monitor_id);
CREATE INDEX idx_monitor_checks_checked_at ON monitor_checks(checked_at DESC);
CREATE INDEX idx_incidents_monitor_id ON incidents(monitor_id);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_status_pages_slug ON status_pages(slug);
CREATE INDEX idx_status_pages_user_id ON status_pages(user_id);
CREATE INDEX idx_notification_channels_user_id ON notification_channels(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_monitors_updated_at BEFORE UPDATE ON monitors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_status_pages_updated_at BEFORE UPDATE ON status_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_channels_updated_at BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically create profile on user signup
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

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_page_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for monitors
CREATE POLICY "Users can view their own monitors"
  ON monitors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitors"
  ON monitors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitors"
  ON monitors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitors"
  ON monitors FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for monitor_checks
CREATE POLICY "Users can view checks for their monitors"
  ON monitor_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = monitor_checks.monitor_id
      AND monitors.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert monitor checks"
  ON monitor_checks FOR INSERT
  WITH CHECK (true);

-- RLS Policies for incidents
CREATE POLICY "Users can view incidents for their monitors"
  ON incidents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = incidents.monitor_id
      AND monitors.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert incidents"
  ON incidents FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update incidents"
  ON incidents FOR UPDATE
  USING (true);

-- RLS Policies for status_pages
CREATE POLICY "Anyone can view public status pages"
  ON status_pages FOR SELECT
  USING (is_public = true);

CREATE POLICY "Users can view their own status pages"
  ON status_pages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own status pages"
  ON status_pages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own status pages"
  ON status_pages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own status pages"
  ON status_pages FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for status_page_monitors
CREATE POLICY "Anyone can view monitors on public status pages"
  ON status_page_monitors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM status_pages
      WHERE status_pages.id = status_page_monitors.status_page_id
      AND status_pages.is_public = true
    )
  );

CREATE POLICY "Users can manage their status page monitors"
  ON status_page_monitors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM status_pages
      WHERE status_pages.id = status_page_monitors.status_page_id
      AND status_pages.user_id = auth.uid()
    )
  );

-- RLS Policies for notification_channels
CREATE POLICY "Users can view their own notification channels"
  ON notification_channels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification channels"
  ON notification_channels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification channels"
  ON notification_channels FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification channels"
  ON notification_channels FOR DELETE
  USING (auth.uid() = user_id);
