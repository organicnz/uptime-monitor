-- ============================================================
-- Populate analytics columns and checked_by field
-- ============================================================
-- avg_response_time_ms and success_rate_percent are now populated by
-- lib/analytics.ts after each check. checked_by is set when a manual
-- check is triggered via the UI.
--
-- This migration ensures the columns exist and updates comments.

-- Ensure columns exist (idempotent)
ALTER TABLE monitors
  ALTER COLUMN avg_response_time_ms SET DEFAULT 0,
  ALTER COLUMN success_rate_percent SET DEFAULT 100;

ALTER TABLE heartbeats
  ALTER COLUMN checked_by DROP DEFAULT;

-- Update comments to reflect live status
COMMENT ON COLUMN monitors.avg_response_time_ms IS
  'Rolling average response time in ms over the last 24h (populated by lib/analytics.ts)';

COMMENT ON COLUMN monitors.success_rate_percent IS
  'Rolling success rate percentage over the last 24h (populated by lib/analytics.ts)';

COMMENT ON COLUMN heartbeats.checked_by IS
  'User ID who triggered a manual check, NULL for automated checks';

-- Create index for checked_by queries
CREATE INDEX IF NOT EXISTS idx_heartbeats_checked_by ON heartbeats(checked_by)
  WHERE checked_by IS NOT NULL;
