CREATE TABLE IF NOT EXISTS cron_failures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id TEXT NOT NULL UNIQUE,
  failed_url TEXT NOT NULL,
  failed_status TEXT,
  failed_message TEXT,
  retried INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_failures_created_at
  ON cron_failures(created_at DESC);

ALTER TABLE cron_failures ENABLE ROW LEVEL SECURITY;

ALTER TABLE monitors ALTER COLUMN active SET DEFAULT true;
UPDATE monitors SET active = true WHERE active IS NULL;
ALTER TABLE monitors ALTER COLUMN active SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN interval SET DEFAULT 60;
UPDATE monitors SET interval = 60 WHERE interval IS NULL;
ALTER TABLE monitors ALTER COLUMN interval SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN retry_interval SET DEFAULT 60;
UPDATE monitors SET retry_interval = 60 WHERE retry_interval IS NULL;
ALTER TABLE monitors ALTER COLUMN retry_interval SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN timeout SET DEFAULT 48;
UPDATE monitors SET timeout = 48 WHERE timeout IS NULL;
ALTER TABLE monitors ALTER COLUMN timeout SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN max_retries SET DEFAULT 1;
UPDATE monitors SET max_retries = 1 WHERE max_retries IS NULL;
ALTER TABLE monitors ALTER COLUMN max_retries SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN ignore_tls SET DEFAULT false;
UPDATE monitors SET ignore_tls = false WHERE ignore_tls IS NULL;
ALTER TABLE monitors ALTER COLUMN ignore_tls SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN upside_down SET DEFAULT false;
UPDATE monitors SET upside_down = false WHERE upside_down IS NULL;
ALTER TABLE monitors ALTER COLUMN upside_down SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN packet_size SET DEFAULT 56;
UPDATE monitors SET packet_size = 56 WHERE packet_size IS NULL;
ALTER TABLE monitors ALTER COLUMN packet_size SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN status SET DEFAULT 1;
UPDATE monitors SET status = 1 WHERE status IS NULL;
ALTER TABLE monitors ALTER COLUMN status SET NOT NULL;

ALTER TABLE monitors ALTER COLUMN down_count SET DEFAULT 0;
UPDATE monitors SET down_count = 0 WHERE down_count IS NULL;
ALTER TABLE monitors ALTER COLUMN down_count SET NOT NULL;

ALTER TABLE heartbeats ALTER COLUMN down_count SET DEFAULT 0;
UPDATE heartbeats SET down_count = 0 WHERE down_count IS NULL;
ALTER TABLE heartbeats ALTER COLUMN down_count SET NOT NULL;

ALTER TABLE heartbeats ALTER COLUMN duration SET DEFAULT 0;
UPDATE heartbeats SET duration = 0 WHERE duration IS NULL;
ALTER TABLE heartbeats ALTER COLUMN duration SET NOT NULL;

DELETE FROM monitor_notifications AS links
USING monitors AS m, notification_channels AS c
WHERE links.monitor_id = m.id
  AND links.channel_id = c.id
  AND m.user_id <> c.user_id;

DELETE FROM maintenance_monitors AS links
USING maintenance AS w, monitors AS m
WHERE links.maintenance_id = w.id
  AND links.monitor_id = m.id
  AND w.user_id <> m.user_id;

DELETE FROM status_page_monitors AS links
USING status_pages AS p, monitors AS m
WHERE links.status_page_id = p.id
  AND links.monitor_id = m.id
  AND p.user_id <> m.user_id;

CREATE OR REPLACE FUNCTION public.mfa_mutation_allowed()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    NOT EXISTS (
      SELECT 1
      FROM auth.mfa_factors
      WHERE user_id = (SELECT auth.uid())
        AND status = 'verified'
    )
    OR COALESCE((SELECT auth.jwt()->>'aal'), 'aal1') = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.mfa_mutation_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mfa_mutation_allowed() TO authenticated;

DROP POLICY IF EXISTS "Public can view public status page incidents" ON incidents;
CREATE POLICY "Public can view public status page incidents"
ON incidents FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1
    FROM status_page_monitors
    JOIN status_pages
      ON status_pages.id = status_page_monitors.status_page_id
    JOIN monitors
      ON monitors.id = status_page_monitors.monitor_id
    WHERE status_page_monitors.monitor_id = incidents.monitor_id
      AND status_pages.is_public = true
      AND monitors.user_id = status_pages.user_id
  )
);

DROP POLICY IF EXISTS "MFA required for profile writes" ON profiles;
CREATE POLICY "MFA required for profile writes"
ON profiles AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for profile deletes" ON profiles;
CREATE POLICY "MFA required for profile deletes"
ON profiles AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for monitor writes" ON monitors;
CREATE POLICY "MFA required for monitor writes"
ON monitors AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for monitor deletes" ON monitors;
CREATE POLICY "MFA required for monitor deletes"
ON monitors AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for group writes" ON monitor_groups;
CREATE POLICY "MFA required for group writes"
ON monitor_groups AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for group deletes" ON monitor_groups;
CREATE POLICY "MFA required for group deletes"
ON monitor_groups AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for channel writes" ON notification_channels;
CREATE POLICY "MFA required for channel writes"
ON notification_channels AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for channel deletes" ON notification_channels;
CREATE POLICY "MFA required for channel deletes"
ON notification_channels AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for monitor notification writes" ON monitor_notifications;
CREATE POLICY "MFA required for monitor notification writes"
ON monitor_notifications AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for monitor notification deletes" ON monitor_notifications;
CREATE POLICY "MFA required for monitor notification deletes"
ON monitor_notifications AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for maintenance writes" ON maintenance;
CREATE POLICY "MFA required for maintenance writes"
ON maintenance AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for maintenance deletes" ON maintenance;
CREATE POLICY "MFA required for maintenance deletes"
ON maintenance AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for maintenance monitor writes" ON maintenance_monitors;
CREATE POLICY "MFA required for maintenance monitor writes"
ON maintenance_monitors AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for maintenance monitor deletes" ON maintenance_monitors;
CREATE POLICY "MFA required for maintenance monitor deletes"
ON maintenance_monitors AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for status page writes" ON status_pages;
CREATE POLICY "MFA required for status page writes"
ON status_pages AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for status page deletes" ON status_pages;
CREATE POLICY "MFA required for status page deletes"
ON status_pages AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for status page monitor writes" ON status_page_monitors;
CREATE POLICY "MFA required for status page monitor writes"
ON status_page_monitors AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for status page monitor deletes" ON status_page_monitors;
CREATE POLICY "MFA required for status page monitor deletes"
ON status_page_monitors AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "MFA required for incident writes" ON incidents;
CREATE POLICY "MFA required for incident writes"
ON incidents AS RESTRICTIVE FOR ALL TO authenticated
USING (true) WITH CHECK (public.mfa_mutation_allowed());
DROP POLICY IF EXISTS "MFA required for incident deletes" ON incidents;
CREATE POLICY "MFA required for incident deletes"
ON incidents AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.mfa_mutation_allowed());

DROP POLICY IF EXISTS "System insert heartbeats" ON heartbeats;

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own groups" ON monitor_groups;
CREATE POLICY "Users can update own groups"
ON monitor_groups FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own monitors" ON monitors;
CREATE POLICY "Users can update own monitors"
ON monitors FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own channels" ON notification_channels;
CREATE POLICY "Users can update own channels"
ON notification_channels FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own maintenance" ON maintenance;
CREATE POLICY "Users can update own maintenance"
ON maintenance FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own status pages" ON status_pages;
CREATE POLICY "Users can update own status pages"
ON status_pages FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own incidents" ON incidents;
CREATE POLICY "Users can update own incidents"
ON incidents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = incidents.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = incidents.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view own monitor notifs" ON monitor_notifications;
CREATE POLICY "Users can view own monitor notifs"
ON monitor_notifications FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = monitor_notifications.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM notification_channels
    WHERE notification_channels.id = monitor_notifications.channel_id
      AND notification_channels.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can manage own monitor notifs" ON monitor_notifications;
CREATE POLICY "Users can manage own monitor notifs"
ON monitor_notifications FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = monitor_notifications.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM notification_channels
    WHERE notification_channels.id = monitor_notifications.channel_id
      AND notification_channels.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = monitor_notifications.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM notification_channels
    WHERE notification_channels.id = monitor_notifications.channel_id
      AND notification_channels.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view own maintenance monitors" ON maintenance_monitors;
CREATE POLICY "Users can view own maintenance monitors"
ON maintenance_monitors FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM maintenance
    WHERE maintenance.id = maintenance_monitors.maintenance_id
      AND maintenance.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = maintenance_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can manage own maintenance monitors" ON maintenance_monitors;
CREATE POLICY "Users can manage own maintenance monitors"
ON maintenance_monitors FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM maintenance
    WHERE maintenance.id = maintenance_monitors.maintenance_id
      AND maintenance.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = maintenance_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM maintenance
    WHERE maintenance.id = maintenance_monitors.maintenance_id
      AND maintenance.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = maintenance_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view own status page monitors" ON status_page_monitors;
CREATE POLICY "Users can view own status page monitors"
ON status_page_monitors FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM status_pages
    WHERE status_pages.id = status_page_monitors.status_page_id
      AND status_pages.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = status_page_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can manage own status page monitors" ON status_page_monitors;
CREATE POLICY "Users can manage own status page monitors"
ON status_page_monitors FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM status_pages
    WHERE status_pages.id = status_page_monitors.status_page_id
      AND status_pages.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = status_page_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM status_pages
    WHERE status_pages.id = status_page_monitors.status_page_id
      AND status_pages.user_id = (SELECT auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM monitors
    WHERE monitors.id = status_page_monitors.monitor_id
      AND monitors.user_id = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.get_public_status_page(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  title TEXT,
  description TEXT,
  custom_domain TEXT,
  monitor_id UUID,
  monitor_name TEXT,
  monitor_type TEXT,
  display_order INTEGER,
  status SMALLINT,
  ping INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    status_pages.id,
    status_pages.slug,
    status_pages.title,
    status_pages.description,
    status_pages.custom_domain,
    monitors.id,
    monitors.name,
    monitors.type,
    status_page_monitors.display_order,
    COALESCE(latest_heartbeat.status, 2::SMALLINT),
    latest_heartbeat.ping
  FROM status_pages
  LEFT JOIN status_page_monitors
    ON status_page_monitors.status_page_id = status_pages.id
  LEFT JOIN monitors
    ON monitors.id = status_page_monitors.monitor_id
    AND monitors.user_id = status_pages.user_id
  LEFT JOIN LATERAL (
    SELECT heartbeats.status, heartbeats.ping
    FROM heartbeats
    WHERE heartbeats.monitor_id = monitors.id
    ORDER BY heartbeats.time DESC
    LIMIT 1
  ) AS latest_heartbeat ON true
  WHERE status_pages.slug = p_slug
    AND status_pages.is_public = true
  ORDER BY status_page_monitors.display_order NULLS LAST, monitors.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_status_page(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_status_page(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_status_page_with_monitors(
  p_title TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_is_public BOOLEAN,
  p_monitor_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  page_id UUID;
BEGIN
  IF NOT public.mfa_mutation_allowed() THEN
    RAISE EXCEPTION 'MFA verification required';
  END IF;

  IF p_monitor_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_monitor_ids) AS requested_monitor(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = requested_monitor.id
        AND monitors.user_id = (SELECT auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'One or more monitors are not owned by the current user';
  END IF;

  INSERT INTO status_pages (user_id, title, slug, description, is_public)
  VALUES ((SELECT auth.uid()), p_title, p_slug, p_description, p_is_public)
  RETURNING id INTO page_id;

  INSERT INTO status_page_monitors (status_page_id, monitor_id, display_order)
  SELECT page_id, requested_monitor.id, requested_monitor.ordinality - 1
  FROM unnest(COALESCE(p_monitor_ids, ARRAY[]::UUID[]))
    WITH ORDINALITY AS requested_monitor(id, ordinality);

  RETURN page_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_status_page_with_monitors(
  p_status_page_id UUID,
  p_title TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_is_public BOOLEAN,
  p_monitor_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.mfa_mutation_allowed() THEN
    RAISE EXCEPTION 'MFA verification required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM status_pages
    WHERE status_pages.id = p_status_page_id
      AND status_pages.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'Status page not found';
  END IF;

  IF p_monitor_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_monitor_ids) AS requested_monitor(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM monitors
      WHERE monitors.id = requested_monitor.id
        AND monitors.user_id = (SELECT auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'One or more monitors are not owned by the current user';
  END IF;

  UPDATE status_pages
  SET title = p_title,
      slug = p_slug,
      description = p_description,
      is_public = p_is_public
  WHERE id = p_status_page_id
    AND user_id = (SELECT auth.uid());

  DELETE FROM status_page_monitors
  WHERE status_page_id = p_status_page_id;

  INSERT INTO status_page_monitors (status_page_id, monitor_id, display_order)
  SELECT p_status_page_id, requested_monitor.id, requested_monitor.ordinality - 1
  FROM unnest(COALESCE(p_monitor_ids, ARRAY[]::UUID[]))
    WITH ORDINALITY AS requested_monitor(id, ordinality);

  RETURN p_status_page_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_status_page_with_monitors(TEXT, TEXT, TEXT, BOOLEAN, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_status_page_with_monitors(TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;

REVOKE ALL ON FUNCTION public.update_status_page_with_monitors(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_status_page_with_monitors(UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID[]) TO authenticated;
