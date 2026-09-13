-- Sync live database with schema.sql
--
-- The hosted database was created from an older schema revision, so columns
-- added later (analytics fields, SSL info, heartbeat enrichment, incident
-- metadata, notification preferences) are missing. This migration adds every
-- column declared in supabase/schema.sql that may not exist yet.
--
-- Run in the Supabase Dashboard SQL Editor (service_role cannot run DDL
-- over PostgREST, so this cannot be applied from the app itself).
-- All statements are idempotent (IF NOT EXISTS).

-- ============================================================
-- MONITORS - status tracking, analytics, SSL info
-- ============================================================
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS down_count INTEGER DEFAULT 0;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ;
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER DEFAULT 0;
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS success_rate_percent INTEGER DEFAULT 100;
ALTER TABLE monitors
  ADD COLUMN IF NOT EXISTS consecutive_uptime INTEGER DEFAULT 0;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS ssl_expiry TIMESTAMPTZ;
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS ssl_issuer TEXT;

CREATE INDEX IF NOT EXISTS idx_monitors_status ON monitors(status);
CREATE INDEX IF NOT EXISTS idx_monitors_last_check ON monitors(last_check_at);

-- ============================================================
-- HEARTBEATS - analytics and error tracking
-- ============================================================
ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS rtt_ms INTEGER;
ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS ssl_valid BOOLEAN DEFAULT false;
ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS error_type TEXT;
ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS ip_resolved INET;
ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS status_reason TEXT;
ALTER TABLE heartbeats
  ADD COLUMN IF NOT EXISTS checked_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_heartbeats_error_type ON heartbeats(error_type);
CREATE INDEX IF NOT EXISTS idx_heartbeats_ssl_valid ON heartbeats(ssl_valid);

-- ============================================================
-- INCIDENTS - severity tracking and audit
-- ============================================================
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'medium';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledgment_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents(source);

-- ============================================================
-- PROFILES - last check + notification preferences
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS telegram_notifications BOOLEAN DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS discord_notifications BOOLEAN DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS slack_notifications BOOLEAN DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS webhook_notifications BOOLEAN DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pushover_notifications BOOLEAN DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS teams_notifications BOOLEAN DEFAULT false;
