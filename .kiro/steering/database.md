# Database Architecture

## Overview

This project uses Supabase (PostgreSQL) with Row Level Security (RLS) enabled on all tables. The schema is inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma).

**Project URL:** `https://bfokpatpfqgrxbrgrefp.supabase.co`

## Entity Relationship Diagram

```
┌─────────────────┐
│   auth.users    │ (Supabase Auth)
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐
│    profiles     │ ◄─────────────────────────────────────────────┐
└────────┬────────┘                                               │
         │ 1:N                                                    │
         ▼                                                        │
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    monitors     │────►│   heartbeats    │     │  status_pages   │
└────────┬────────┘ 1:N └─────────────────┘     └────────┬────────┘
         │                                               │
         │ 1:N                                           │ 1:N
         ▼                                               ▼
┌─────────────────┐                           ┌─────────────────────┐
│   incidents     │                           │ status_page_monitors│
└─────────────────┘                           └─────────────────────┘
         │
         │ N:M (via junction tables)
         ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  monitor_notifications  │────►│  notification_channels  │
└─────────────────────────┘     └─────────────────────────┘

┌─────────────────┐     ┌─────────────────────────┐
│   maintenance   │────►│  maintenance_monitors   │
└─────────────────┘ 1:N └─────────────────────────┘
```

## Tables Summary

### Core Tables

| Table                   | Description                          | RLS | Rows |
| ----------------------- | ------------------------------------ | --- | ---- |
| `profiles`              | User accounts (linked to auth.users) | ✅  | 1    |
| `monitors`              | Endpoints being tracked              | ✅  | 18   |
| `heartbeats`            | Individual check results             | ✅  | 0    |
| `incidents`             | Outage tracking                      | ✅  | 0    |
| `notification_channels` | Alert destinations                   | ✅  | 0    |
| `status_pages`          | Public status dashboards             | ✅  | 0    |
| `maintenance`           | Scheduled downtime windows           | ✅  | 0    |

### Junction Tables

| Table                   | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `monitor_notifications` | Links monitors to notification channels             |
| `status_page_monitors`  | Links status pages to monitors (with display_order) |
| `maintenance_monitors`  | Links maintenance windows to affected monitors      |

---

## Row Level Security (RLS) Policies

All tables have RLS enabled. Below are the actual policies from the database:

### profiles

| Policy                       | Command | Condition         |
| ---------------------------- | ------- | ----------------- |
| Users can view own profile   | SELECT  | `auth.uid() = id` |
| Users can update own profile | UPDATE  | `auth.uid() = id` |

### monitors

| Policy                        | Command | Condition                           |
| ----------------------------- | ------- | ----------------------------------- |
| Users can view own monitors   | SELECT  | `auth.uid() = user_id`              |
| Users can insert own monitors | INSERT  | `auth.uid() = user_id` (WITH CHECK) |
| Users can update own monitors | UPDATE  | `auth.uid() = user_id`              |
| Users can delete own monitors | DELETE  | `auth.uid() = user_id`              |

### heartbeats

| Policy                            | Command | Condition                                                                                                     |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Users view own monitor heartbeats | SELECT  | `EXISTS (SELECT 1 FROM monitors WHERE monitors.id = heartbeats.monitor_id AND monitors.user_id = auth.uid())` |
| System insert heartbeats          | INSERT  | `true` (requires service role)                                                                                |

### notification_channels

| Policy                        | Command | Condition                           |
| ----------------------------- | ------- | ----------------------------------- |
| Users can view own channels   | SELECT  | `auth.uid() = user_id`              |
| Users can insert own channels | INSERT  | `auth.uid() = user_id` (WITH CHECK) |
| Users can update own channels | UPDATE  | `auth.uid() = user_id`              |
| Users can delete own channels | DELETE  | `auth.uid() = user_id`              |

### monitor_notifications

| Policy                              | Command | Condition                                                                                                                |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Users can view own monitor notifs   | SELECT  | `EXISTS (SELECT 1 FROM monitors WHERE monitors.id = monitor_notifications.monitor_id AND monitors.user_id = auth.uid())` |
| Users can manage own monitor notifs | ALL     | `EXISTS (SELECT 1 FROM monitors WHERE monitors.id = monitor_notifications.monitor_id AND monitors.user_id = auth.uid())` |

### Tables WITHOUT RLS Policies (⚠️ Security Issue)

- `incidents` - RLS enabled but NO policies
- `maintenance` - RLS enabled but NO policies
- `maintenance_monitors` - RLS enabled but NO policies
- `status_pages` - RLS enabled but NO policies
- `status_page_monitors` - RLS enabled but NO policies

---

## Database Functions

### handle_new_user()

Auto-creates profile when user signs up.

```sql
-- Security: DEFINER (runs with creator's privileges)
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
```

### update_updated_at_column()

Auto-updates `updated_at` timestamp on row modification.

```sql
-- Security: INVOKER (runs with caller's privileges)
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
```

---

## Database Triggers

| Trigger                                   | Table                 | Event  | Action                       |
| ----------------------------------------- | --------------------- | ------ | ---------------------------- |
| `update_profiles_updated_at`              | profiles              | UPDATE | `update_updated_at_column()` |
| `update_monitors_updated_at`              | monitors              | UPDATE | `update_updated_at_column()` |
| `update_notification_channels_updated_at` | notification_channels | UPDATE | `update_updated_at_column()` |
| `update_maintenance_updated_at`           | maintenance           | UPDATE | `update_updated_at_column()` |
| `update_status_pages_updated_at`          | status_pages          | UPDATE | `update_updated_at_column()` |

**Auth Trigger** (in auth schema):

- `on_auth_user_created` → Calls `handle_new_user()` after INSERT on `auth.users`

---

## Notification Credentials (Vault)

`notification_channels.config` holds non-sensitive settings only. Credentials
live in `vault.secrets`, referenced by `notification_channels.secret_id`, and
are reachable only through these owner-checked `SECURITY DEFINER` functions:

- `notification_channel_secret(channel_id)` / `notification_channel_secrets(ids)`
- `notification_channel_set_secret(channel_id, partial_jsonb)`
- `notification_channel_clear_secret(channel_id)`
- `notification_channel_secret_id(channel_id)` - the owner gate; not callable by
  `anon` or `authenticated`

`anon` and `authenticated` have no direct grants on `vault.secrets` or
`vault.decrypted_secrets`. `notification_channels_config_has_no_secrets`
refuses a credential in `config`. Keep `SENSITIVE_CONFIG_KEYS` in
`lib/notification-types.ts` in lockstep with the backfill and the constraint.

## Edge Functions

**Status:** No edge functions deployed.

---

## Storage Buckets

**Status:** No storage buckets configured.

---

## Installed Extensions

| Extension            | Schema     | Description                                                                        |
| -------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `uuid-ossp`          | extensions | UUID generation                                                                    |
| `pgcrypto`           | extensions | Cryptographic functions                                                            |
| `pg_graphql`         | graphql    | GraphQL support                                                                    |
| `pg_stat_statements` | extensions | Query statistics                                                                   |
| `supabase_vault`     | vault      | Secrets management; created by `20260927094500_add_vault_notification_secrets.sql` |
| `plpgsql`            | pg_catalog | PL/pgSQL language                                                                  |

---

## Advisor Warnings

### 🔴 Security Issues

#### Tables Missing RLS Policies

None. The snapshot below predates `20260821_add_incidents_rls_policies.sql`;
`supabase/schema.sql` now defines owner-scoped SELECT/INSERT/UPDATE/DELETE
policies for all five tables. Re-check with the advisor before trusting this
file again.

#### Functions with Mutable Search Path

| Function                   | Issue                        |
| -------------------------- | ---------------------------- |
| `update_updated_at_column` | Has role mutable search_path |
| `handle_new_user`          | Has role mutable search_path |

**Fix:** Set explicit `search_path` in function definitions:

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
```

#### Leaked Password Protection Disabled

Supabase Auth's HaveIBeenPwned integration is disabled. Enable it in Auth settings.

### 🟡 Performance Issues

#### RLS Policies Need Optimization

All policies using `auth.uid()` should use `(select auth.uid())` for better performance:

**Affected Tables:**

- profiles (2 policies)
- monitors (4 policies)
- heartbeats (1 policy)
- notification_channels (4 policies)
- monitor_notifications (2 policies)

**Fix Example:**

```sql
-- Before (re-evaluates per row)
CREATE POLICY "Users can view own monitors" ON monitors
FOR SELECT USING (auth.uid() = user_id);

-- After (evaluates once)
CREATE POLICY "Users can view own monitors" ON monitors
FOR SELECT USING ((select auth.uid()) = user_id);
```

#### Multiple Permissive Policies

`monitor_notifications` has overlapping SELECT policies:

- "Users can manage own monitor notifs" (ALL)
- "Users can view own monitor notifs" (SELECT)

**Fix:** Remove the redundant SELECT policy since ALL already covers SELECT.

#### Unindexed Foreign Keys

| Table                   | Foreign Key                             | Missing Index |
| ----------------------- | --------------------------------------- | ------------- |
| `maintenance`           | `maintenance_user_id_fkey`              | `user_id`     |
| `maintenance_monitors`  | `maintenance_monitors_monitor_id_fkey`  | `monitor_id`  |
| `monitor_notifications` | `monitor_notifications_channel_id_fkey` | `channel_id`  |
| `monitors`              | `monitors_parent_id_fkey`               | `parent_id`   |
| `notification_channels` | `notification_channels_user_id_fkey`    | `user_id`     |
| `status_page_monitors`  | `status_page_monitors_monitor_id_fkey`  | `monitor_id`  |
| `status_pages`          | `status_pages_user_id_fkey`             | `user_id`     |

**Fix:**

```sql
CREATE INDEX idx_maintenance_user_id ON maintenance(user_id);
CREATE INDEX idx_maintenance_monitors_monitor_id ON maintenance_monitors(monitor_id);
CREATE INDEX idx_monitor_notifications_channel_id ON monitor_notifications(channel_id);
CREATE INDEX idx_monitors_parent_id ON monitors(parent_id);
CREATE INDEX idx_notification_channels_user_id ON notification_channels(user_id);
CREATE INDEX idx_status_page_monitors_monitor_id ON status_page_monitors(monitor_id);
CREATE INDEX idx_status_pages_user_id ON status_pages(user_id);
```

#### Unused Indexes

| Index                           | Table                 | Status     |
| ------------------------------- | --------------------- | ---------- |
| `idx_monitors_active`           | monitors              | Never used |
| `idx_heartbeats_status`         | heartbeats            | Never used |
| `idx_incidents_monitor_id`      | incidents             | Never used |
| `idx_monitor_notifs_monitor_id` | monitor_notifications | Never used |
| `idx_maintenance_active`        | maintenance           | Never used |

**Note:** These may become useful as the app scales. Monitor before removing.

---

## Existing Indexes

| Index                           | Table                 | Columns    | Purpose                 |
| ------------------------------- | --------------------- | ---------- | ----------------------- |
| `idx_monitors_user_id`          | monitors              | user_id    | User's monitors lookup  |
| `idx_monitors_active`           | monitors              | active     | Active monitors filter  |
| `idx_heartbeats_monitor_id`     | heartbeats            | monitor_id | Monitor's heartbeats    |
| `idx_heartbeats_time`           | heartbeats            | time DESC  | Recent heartbeats       |
| `idx_heartbeats_status`         | heartbeats            | status     | Status filtering        |
| `idx_incidents_monitor_id`      | incidents             | monitor_id | Monitor's incidents     |
| `idx_monitor_notifs_monitor_id` | monitor_notifications | monitor_id | Monitor's notifications |
| `idx_maintenance_active`        | maintenance           | active     | Active maintenance      |

---

## Key Tables Detail

### profiles

| Column       | Type | Description                  |
| ------------ | ---- | ---------------------------- |
| `id`         | UUID | PK, references auth.users    |
| `email`      | TEXT | User email                   |
| `full_name`  | TEXT | Display name                 |
| `avatar_url` | TEXT | Profile image                |
| `timezone`   | TEXT | User timezone (default: UTC) |

### monitors

| Column        | Type    | Description                                  |
| ------------- | ------- | -------------------------------------------- |
| `id`          | UUID    | Primary key                                  |
| `user_id`     | UUID    | FK to profiles                               |
| `name`        | TEXT    | Display name                                 |
| `type`        | TEXT    | http, tcp, ping, keyword, dns, docker, steam |
| `active`      | BOOLEAN | Enable/disable monitoring                    |
| `url`         | TEXT    | For HTTP/keyword monitors                    |
| `method`      | TEXT    | HTTP method (GET, POST, etc.)                |
| `hostname`    | TEXT    | For TCP/Ping/DNS monitors                    |
| `port`        | INTEGER | For TCP monitors                             |
| `keyword`     | TEXT    | For keyword monitors                         |
| `headers`     | JSONB   | Custom HTTP headers                          |
| `body`        | TEXT    | Request body                                 |
| `interval`    | INTEGER | Check interval (seconds, default: 60)        |
| `timeout`     | INTEGER | Request timeout (seconds, default: 48)       |
| `max_retries` | INTEGER | Retries before marking down                  |
| `ignore_tls`  | BOOLEAN | Skip TLS verification                        |
| `upside_down` | BOOLEAN | Invert status logic                          |
| `parent_id`   | UUID    | Self-reference for grouped monitors          |

### heartbeats

| Column       | Type        | Description                            |
| ------------ | ----------- | -------------------------------------- |
| `id`         | UUID        | Primary key                            |
| `monitor_id` | UUID        | FK to monitors                         |
| `status`     | SMALLINT    | 0=DOWN, 1=UP, 2=PENDING, 3=MAINTENANCE |
| `msg`        | TEXT        | Status message or error                |
| `ping`       | INTEGER     | Response time (ms)                     |
| `duration`   | INTEGER     | Total check duration (ms)              |
| `down_count` | INTEGER     | Consecutive down count                 |
| `time`       | TIMESTAMPTZ | Check timestamp                        |

### notification_channels

| Column       | Type    | Description                                               |
| ------------ | ------- | --------------------------------------------------------- |
| `id`         | UUID    | Primary key                                               |
| `user_id`    | UUID    | FK to profiles                                            |
| `name`       | TEXT    | Channel name                                              |
| `type`       | TEXT    | email, discord, slack, webhook, telegram, teams, pushover |
| `config`     | JSONB   | Type-specific configuration                               |
| `is_default` | BOOLEAN | Auto-assign to new monitors                               |
| `active`     | BOOLEAN | Enable/disable channel                                    |

### status_pages

| Column                | Type    | Description       |
| --------------------- | ------- | ----------------- |
| `id`                  | UUID    | Primary key       |
| `user_id`             | UUID    | FK to profiles    |
| `slug`                | TEXT    | URL slug (unique) |
| `title`               | TEXT    | Page title        |
| `description`         | TEXT    | Page description  |
| `theme`               | TEXT    | auto, light, dark |
| `custom_domain`       | TEXT    | Custom domain     |
| `is_public`           | BOOLEAN | Public visibility |
| `google_analytics_id` | TEXT    | GA tracking ID    |

### incidents

| Column        | Type        | Description                         |
| ------------- | ----------- | ----------------------------------- |
| `id`          | UUID        | Primary key                         |
| `monitor_id`  | UUID        | FK to monitors                      |
| `title`       | TEXT        | Incident title                      |
| `content`     | TEXT        | Incident details                    |
| `status`      | SMALLINT    | 0=OPEN, 1=RESOLVED, 2=INVESTIGATING |
| `started_at`  | TIMESTAMPTZ | Incident start time                 |
| `resolved_at` | TIMESTAMPTZ | Resolution time                     |

### maintenance

| Column        | Type        | Description                   |
| ------------- | ----------- | ----------------------------- |
| `id`          | UUID        | Primary key                   |
| `user_id`     | UUID        | FK to profiles                |
| `title`       | TEXT        | Maintenance title             |
| `description` | TEXT        | Details                       |
| `start_date`  | TIMESTAMPTZ | Start time                    |
| `end_date`    | TIMESTAMPTZ | End time                      |
| `active`      | BOOLEAN     | Enable/disable                |
| `strategy`    | TEXT        | manual, single, recurring     |
| `cron`        | TEXT        | Cron expression for recurring |

---

## Status Codes

### Heartbeat Status

| Value | Constant    | Description       |
| ----- | ----------- | ----------------- |
| 0     | DOWN        | Monitor is down   |
| 1     | UP          | Monitor is up     |
| 2     | PENDING     | Check in progress |
| 3     | MAINTENANCE | Under maintenance |

### Incident Status

| Value | Constant      | Description         |
| ----- | ------------- | ------------------- |
| 0     | OPEN          | Active incident     |
| 1     | RESOLVED      | Incident resolved   |
| 2     | INVESTIGATING | Under investigation |

---

## Notification Channel Config Schemas

### Telegram

```json
{ "bot_token": "string", "chat_id": "string" }
```

### Discord

```json
{ "webhook_url": "string" }
```

### Slack

```json
{ "webhook_url": "string" }
```

### Microsoft Teams

```json
{ "webhook_url": "string" }
```

### Pushover

```json
{ "user_key": "string", "api_token": "string" }
```

### Webhook

```json
{ "url": "string", "method": "GET|POST", "headers": {} }
```

### Email (planned)

```json
{
  "smtp_host": "string",
  "smtp_port": "number",
  "username": "string",
  "password": "string",
  "to": "string"
}
```
