-- ============================================================
-- Heartbeat retention + daily rollups (Disk IO fix)
-- ============================================================
-- heartbeats is append-only (one row per monitor per check) with 7
-- indexes. Every cron tick both wrote rows and re-read the whole
-- table, which depleted the Disk IO budget once history grew.
--
-- This migration:
-- 1. Adds heartbeat_daily: one row per monitor per UTC day, so 30/90d
--    reports keep working after raw rows are trimmed to 7 days.
-- 2. Adds retention_rollup_and_cleanup(): rolls full UTC days older
--    than the cutoff into heartbeat_daily (recompute, idempotent while
--    source rows exist), then deletes raw rows in small ctid batches
--    to avoid long locks on a small compute plan.
-- 3. Drops pure-write-overhead indexes: idx_heartbeats_ssl_valid
--    (ssl_valid is RESERVED, always false, never queried) and
--    idx_heartbeats_monitor_id (redundant prefix of
--    idx_heartbeats_monitor_time, which serves monitor_id-only
--    lookups too).
--
-- All statements are idempotent. Run retention from
-- app/api/cron/cleanup (service_role) daily, not from the browser.
-- ============================================================

CREATE TABLE IF NOT EXISTS heartbeat_daily (
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  total_checks INTEGER NOT NULL DEFAULT 0,
  up_checks INTEGER NOT NULL DEFAULT 0,
  down_checks INTEGER NOT NULL DEFAULT 0,
  degraded_checks INTEGER NOT NULL DEFAULT 0,
  pending_checks INTEGER NOT NULL DEFAULT 0,
  maintenance_checks INTEGER NOT NULL DEFAULT 0,
  avg_ping INTEGER,
  min_ping INTEGER,
  max_ping INTEGER,
  PRIMARY KEY (monitor_id, day)
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_daily_monitor_day
  ON heartbeat_daily(monitor_id, day DESC);

ALTER TABLE heartbeat_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily rollups" ON heartbeat_daily;
CREATE POLICY "Users can view own daily rollups"
ON heartbeat_daily FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = heartbeat_daily.monitor_id
      AND monitors.user_id = auth.uid()
  )
);

-- Roll up full UTC days older than the cutoff, then delete raw rows in
-- bounded batches. Recompute (not additive) so reruns before the delete
-- are idempotent; days with no remaining source rows insert nothing, so
-- a rerun after the delete never zeroes a finished rollup.
CREATE OR REPLACE FUNCTION public.retention_rollup_and_cleanup(
  p_retention_days INTEGER DEFAULT 7,
  p_batch_size INTEGER DEFAULT 1000,
  p_max_batches INTEGER DEFAULT 20
)
RETURNS TABLE (rolled_up_days INTEGER, deleted_rows BIGINT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (GREATEST(p_retention_days, 1) || ' days')::INTERVAL;
  v_cutoff_day DATE := (v_cutoff AT TIME ZONE 'UTC')::DATE;
  v_rolled_up INTEGER := 0;
  v_deleted BIGINT := 0;
  v_iter INTEGER;
  v_n INTEGER;
BEGIN
  INSERT INTO public.heartbeat_daily (
    monitor_id, day, total_checks, up_checks, down_checks,
    degraded_checks, pending_checks, maintenance_checks,
    avg_ping, min_ping, max_ping
  )
  SELECT
    h.monitor_id,
    (h.time AT TIME ZONE 'UTC')::DATE AS day,
    COUNT(*)::INTEGER AS total_checks,
    COUNT(*) FILTER (WHERE h.status = 1)::INTEGER AS up_checks,
    COUNT(*) FILTER (WHERE h.status = 0)::INTEGER AS down_checks,
    COUNT(*) FILTER (WHERE h.status = 4)::INTEGER AS degraded_checks,
    COUNT(*) FILTER (WHERE h.status = 2)::INTEGER AS pending_checks,
    COUNT(*) FILTER (WHERE h.status = 3)::INTEGER AS maintenance_checks,
    AVG(h.ping) FILTER (WHERE h.ping IS NOT NULL AND h.ping > 0)::INTEGER AS avg_ping,
    MIN(h.ping) FILTER (WHERE h.ping IS NOT NULL AND h.ping > 0)::INTEGER AS min_ping,
    MAX(h.ping) FILTER (WHERE h.ping IS NOT NULL AND h.ping > 0)::INTEGER AS max_ping
  FROM public.heartbeats AS h
  WHERE h.time < v_cutoff
    AND (h.time AT TIME ZONE 'UTC')::DATE < v_cutoff_day
  GROUP BY h.monitor_id, (h.time AT TIME ZONE 'UTC')::DATE
  ON CONFLICT (monitor_id, day) DO UPDATE SET
    total_checks = EXCLUDED.total_checks,
    up_checks = EXCLUDED.up_checks,
    down_checks = EXCLUDED.down_checks,
    degraded_checks = EXCLUDED.degraded_checks,
    pending_checks = EXCLUDED.pending_checks,
    maintenance_checks = EXCLUDED.maintenance_checks,
    avg_ping = EXCLUDED.avg_ping,
    min_ping = EXCLUDED.min_ping,
    max_ping = EXCLUDED.max_ping;

  GET DIAGNOSTICS v_rolled_up = ROW_COUNT;

  FOR v_iter IN 1..GREATEST(p_max_batches, 1) LOOP
    WITH doomed AS (
      SELECT ctid
      FROM public.heartbeats
      WHERE time < v_cutoff
        AND (time AT TIME ZONE 'UTC')::DATE < v_cutoff_day
      LIMIT GREATEST(p_batch_size, 1)
    )
    DELETE FROM public.heartbeats AS h
    USING doomed
    WHERE h.ctid = doomed.ctid;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
    EXIT WHEN v_n = 0;
  END LOOP;

  rolled_up_days := v_rolled_up;
  deleted_rows := v_deleted;
  RETURN NEXT;
END;
$$;

-- Service-role only: the cleanup route calls this with the service key.
-- Never expose to anon/authenticated; it deletes tenant rows.
REVOKE ALL ON FUNCTION public.retention_rollup_and_cleanup(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_rollup_and_cleanup(INTEGER, INTEGER, INTEGER)
  TO service_role;

-- Write-amplification trim: each heartbeat insert updated all of these.
-- ssl_valid is RESERVED (always false, never queried); monitor_id alone
-- is served by the (monitor_id, time DESC) composite.
DROP INDEX IF EXISTS idx_heartbeats_ssl_valid;
DROP INDEX IF EXISTS idx_heartbeats_monitor_id;
