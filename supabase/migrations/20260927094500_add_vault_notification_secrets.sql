-- ============================================================
-- Vault-backed notification channel credentials
-- ============================================================
-- `notification_channels.config` used to hold every credential a
-- channel needs: Telegram bot tokens, Discord/Slack/Teams webhook
-- URLs, Pushover tokens, SMTP passwords. Because the dashboard
-- reads that column straight from the browser, any XSS, malicious
-- extension or devtools session recovered all of it in cleartext.
--
-- This migration moves every credential into `vault.secrets` and
-- leaves only non-sensitive settings in `config`. The vault is
-- reachable exclusively through owner-checked SECURITY DEFINER
-- functions, and a CHECK constraint stops a credential from ever
-- being written back into `config`.
--
-- Ordering matters: backfill strips secrets from `config` *before*
-- the CHECK constraint is added, so the constraint can never fail
-- on pre-existing rows.

-- Vault is not optional here: it is the only credential store this
-- project has for tenant-supplied secrets.
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

ALTER TABLE notification_channels
  ADD COLUMN IF NOT EXISTS secret_id UUID;

COMMENT ON COLUMN notification_channels.secret_id IS
  'vault.secrets row holding this channel''s credential fields. Reachable only through public.notification_channel_secret(s).';

-- Supabase grants `public` schema CREATE to every role by default,
-- which lets a compromised anon key define a function that runs as
-- its owner. Nothing in this app creates objects at runtime.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon;
REVOKE CREATE ON SCHEMA public FROM authenticated;

-- ============================================================
-- Owner gate shared by every vault accessor
-- ============================================================
-- Returns the channel's `secret_id` after proving the caller owns
-- the channel. `service_role` is allowed through because delivery
-- runs from cron with a service-role client; every other role must
-- match the channel owner.
CREATE OR REPLACE FUNCTION public.notification_channel_secret_id(
  p_channel_id UUID
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_secret_id UUID;
BEGIN
  SELECT user_id, secret_id INTO v_user_id, v_secret_id
  FROM public.notification_channels
  WHERE id = p_channel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification channel % not found', p_channel_id
      USING ERRCODE = 'P0002';
  END IF;

  -- COALESCE matters: `auth.role()` is NULL with no JWT claims (SQL editor,
  -- the migration runner), and `NULL <> 'service_role'` is NULL, which plpgsql
  -- treats as false. Being explicit keeps "no claims" reading as "not
  -- service_role" rather than as an accident.
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
    AND (SELECT auth.uid()) IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'not the owner of notification channel %', p_channel_id
      USING ERRCODE = '42501';
  END IF;

  RETURN v_secret_id;
END;
$$;

-- ============================================================
-- Read paths
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_channel_secret(
  p_channel_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  v_secret_id := public.notification_channel_secret_id(p_channel_id);

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT d.decrypted_secret
    FROM vault.decrypted_secrets d
    WHERE d.id = v_secret_id
  );
END;
$$;

-- Batched variant so a delivery fan-out costs one round trip.
CREATE OR REPLACE FUNCTION public.notification_channel_secrets(
  p_channel_ids UUID[]
) RETURNS TABLE (out_channel_id UUID, out_secret JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' AND EXISTS (
    SELECT 1
    FROM public.notification_channels c
    WHERE c.id = ANY (p_channel_ids)
      AND c.user_id IS DISTINCT FROM (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'not the owner of every requested notification channel'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT c.id, d.decrypted_secret
    FROM public.notification_channels c
    JOIN vault.decrypted_secrets d ON d.id = c.secret_id
    WHERE c.id = ANY (p_channel_ids);
END;
$$;

-- ============================================================
-- Write path
-- ============================================================
-- `p_secret` merges into whatever is already stored, so a partial
-- update (rotating one field) never has to resend the others. The
-- caller decides when to clear: use notification_channel_clear_secret.
CREATE OR REPLACE FUNCTION public.notification_channel_set_secret(
  p_channel_id UUID,
  p_secret JSONB
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
  v_merged JSONB;
  v_name TEXT;
BEGIN
  -- Trusted writer: see notification_channels_guard_secret_id.
  PERFORM set_config('app.notification_secret_write', 'on', true);

  v_secret_id := public.notification_channel_secret_id(p_channel_id);

  IF p_secret IS NULL OR p_secret = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT name INTO v_name
  FROM public.notification_channels
  WHERE id = p_channel_id;

  v_merged := COALESCE(
    (
      SELECT d.decrypted_secret
      FROM vault.decrypted_secrets d
      WHERE d.id = v_secret_id
    ),
    '{}'::jsonb
  ) || p_secret;

  IF v_merged = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF v_secret_id IS NULL THEN
    INSERT INTO vault.secrets (name, description, secret, secret_type)
    VALUES (
      'notification_channel:' || p_channel_id::text,
      'Credential fields for notification channel ' || v_name,
      v_merged::text,
      'notification_channel'
    )
    RETURNING id INTO v_secret_id;
  ELSE
    INSERT INTO vault.secrets (id, name, description, secret, secret_type)
    VALUES (
      v_secret_id,
      'notification_channel:' || p_channel_id::text,
      'Credential fields for notification channel ' || v_name,
      v_merged::text,
      'notification_channel'
    )
    ON CONFLICT (id) DO UPDATE
      SET secret = EXCLUDED.secret,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          updated_at = now()
    RETURNING id INTO v_secret_id;
  END IF;

  UPDATE public.notification_channels
  SET secret_id = v_secret_id
  WHERE id = p_channel_id;

  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_channel_clear_secret(
  p_channel_id UUID
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- Trusted writer: see notification_channels_guard_secret_id.
  PERFORM set_config('app.notification_secret_write', 'on', true);

  v_secret_id := public.notification_channel_secret_id(p_channel_id);

  IF v_secret_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM vault.secrets WHERE id = v_secret_id;

  UPDATE public.notification_channels
  SET secret_id = NULL
  WHERE id = p_channel_id;
END;
$$;

-- ============================================================
-- Only the functions above may move `secret_id`
-- ============================================================
-- Without this, a client holding a user JWT could point its own channel at
-- another tenant's vault row and then read it back through
-- notification_channel_secret(): the owner gate checks the *channel*, not the
-- vault row, so the gate alone does not close the hole. Column-level privileges
-- are not enough either, because a table-level GRANT still applies.
--
-- The trusted writers flag a transaction-local setting; everything else is
-- rejected. Superusers do not bypass triggers, so the backfill below sets the
-- flag too.
CREATE OR REPLACE FUNCTION public.notification_channels_guard_secret_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.secret_id IS NOT NULL THEN
      RAISE EXCEPTION
        'notification_channels.secret_id may only be set by notification_channel_set_secret()'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.secret_id IS DISTINCT FROM OLD.secret_id
    AND current_setting('app.notification_secret_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'notification_channels.secret_id may only be set by notification_channel_set_secret()'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_notification_channel_secret_id ON notification_channels;
CREATE TRIGGER guard_notification_channel_secret_id
BEFORE INSERT OR UPDATE OF secret_id ON notification_channels
FOR EACH ROW EXECUTE FUNCTION public.notification_channels_guard_secret_id();

-- ============================================================
-- Backfill: move existing credentials into the vault
-- ============================================================
DO $$
DECLARE
  v_row RECORD;
  v_public JSONB;
  v_secret JSONB;
  v_secret_id UUID;
BEGIN
  -- Trusted writer: this block updates secret_id directly.
  PERFORM set_config('app.notification_secret_write', 'on', true);

  FOR v_row IN
    SELECT id, config FROM public.notification_channels
    WHERE secret_id IS NULL AND config IS NOT NULL
  LOOP
    v_public := '{}'::jsonb;
    v_secret := '{}'::jsonb;

    -- Keep the key set here in lockstep with
    -- SENSITIVE_CONFIG_KEYS in lib/notification-types.ts and with
    -- notification_channels_config_has_no_secrets below.
    IF v_row.config ? 'bot_token'::text THEN
      v_secret := v_secret || jsonb_build_object('bot_token', v_row.config -> 'bot_token');
    END IF;
    IF v_row.config ? 'webhook_url'::text THEN
      v_secret := v_secret || jsonb_build_object('webhook_url', v_row.config -> 'webhook_url');
    END IF;
    IF v_row.config ? 'url'::text THEN
      v_secret := v_secret || jsonb_build_object('url', v_row.config -> 'url');
    END IF;
    IF v_row.config ? 'headers'::text THEN
      v_secret := v_secret || jsonb_build_object('headers', v_row.config -> 'headers');
    END IF;
    IF v_row.config ? 'user_key'::text THEN
      v_secret := v_secret || jsonb_build_object('user_key', v_row.config -> 'user_key');
    END IF;
    IF v_row.config ? 'token'::text THEN
      v_secret := v_secret || jsonb_build_object('token', v_row.config -> 'token');
    END IF;
    IF v_row.config ? 'api_token'::text THEN
      -- The dashboard historically wrote Pushover's API token under
      -- `api_token` while the sender read `token`, so the field was
      -- always missing at send time. Normalise on the way in.
      v_secret := v_secret || jsonb_build_object('token', v_row.config -> 'api_token');
    END IF;
    IF v_row.config ? 'smtp_host'::text THEN
      v_secret := v_secret || jsonb_build_object('smtp_host', v_row.config -> 'smtp_host');
    END IF;
    IF v_row.config ? 'smtp_port'::text THEN
      v_secret := v_secret || jsonb_build_object('smtp_port', v_row.config -> 'smtp_port');
    END IF;
    IF v_row.config ? 'username'::text THEN
      v_secret := v_secret || jsonb_build_object('username', v_row.config -> 'username');
    END IF;
    IF v_row.config ? 'password'::text THEN
      v_secret := v_secret || jsonb_build_object('password', v_row.config -> 'password');
    END IF;
    IF v_row.config ? 'to'::text THEN
      v_secret := v_secret || jsonb_build_object('to', v_row.config -> 'to');
    END IF;

    -- `jsonb - text[]` is PostgreSQL 16+, so rebuild the object instead of
    -- relying on the running server's version.
    SELECT COALESCE(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    INTO v_public
    FROM jsonb_each(v_row.config) AS e(key, value)
    WHERE e.key <> ALL (ARRAY[
      'bot_token', 'webhook_url', 'url', 'headers', 'user_key',
      'token', 'api_token', 'smtp_host', 'smtp_port', 'username',
      'password', 'to'
    ]);

    UPDATE public.notification_channels
    SET config = v_public
    WHERE id = v_row.id;

    IF v_secret <> '{}'::jsonb THEN
      INSERT INTO vault.secrets (name, description, secret, secret_type)
      VALUES (
        'notification_channel:' || v_row.id::text,
        'Credential fields for notification channel ' || v_row.id::text,
        v_secret::text,
        'notification_channel'
      )
      RETURNING id INTO v_secret_id;

      UPDATE public.notification_channels
      SET secret_id = v_secret_id
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Guardrail: a credential can never live in `config` again
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_channels_config_has_no_secrets'
      AND conrelid = 'public.notification_channels'::regclass
  ) THEN
    ALTER TABLE public.notification_channels
      ADD CONSTRAINT notification_channels_config_has_no_secrets
      CHECK (
        NOT (config ?| ARRAY[
          'bot_token', 'webhook_url', 'url', 'headers', 'user_key',
          'token', 'api_token', 'smtp_host', 'smtp_port', 'username',
          'password', 'to'
        ]::text[])
      );
  END IF;
END $$;

-- ============================================================
-- Cascade: deleting a channel deletes its vault secret
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_channels_delete_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.secret_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_notification_channel_secret ON notification_channels;
CREATE TRIGGER delete_notification_channel_secret
BEFORE DELETE ON notification_channels
FOR EACH ROW EXECUTE FUNCTION public.notification_channels_delete_secret();

-- ============================================================
-- Grants: the vault is reachable only through the functions above
-- ============================================================
REVOKE ALL ON vault.secrets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.notification_channel_secret_id(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channel_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channel_secrets(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channel_set_secret(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channel_clear_secret(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channels_guard_secret_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notification_channels_delete_secret() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.notification_channel_secret(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_channel_secrets(UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_channel_set_secret(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notification_channel_clear_secret(UUID) TO authenticated, service_role;
