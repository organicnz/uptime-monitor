/**
 * The schema the live database is expected to have after every migration has
 * been applied.
 *
 * Shared by `scripts/supabase-verify-schema.ts` (the CI gate that fails when
 * the live database drifts) and `__tests__/lib/supabase-delivery.test.ts`
 * (which proves every column listed here is covered by
 * `supabase/schema.sql` or by a migration file). Keeping one table means the
 * gate and the test can never disagree about what "correct" means.
 */
export const EXPECTED_COLUMNS: Record<string, string[]> = {
  monitors: [
    "status",
    "down_count",
    "last_check_at",
    "last_status_change_at",
    "avg_response_time_ms",
    "success_rate_percent",
    "consecutive_uptime",
    "ssl_expiry",
    "ssl_issuer",
    "group_id",
  ],
  heartbeats: [
    "rtt_ms",
    "ssl_valid",
    "error_type",
    "ip_resolved",
    "status_reason",
    "checked_by",
  ],
  notification_channels: ["id", "type", "config", "secret_id"],
  incidents: ["severity", "source", "resolved_by", "acknowledgment_at"],
  cron_failures: [
    "message_id",
    "failed_url",
    "failed_status",
    "failed_message",
    "retried",
    "created_at",
  ],
  profiles: [
    "last_check_at",
    "email_notifications",
    "telegram_notifications",
    "discord_notifications",
    "slack_notifications",
    "webhook_notifications",
    "pushover_notifications",
    "teams_notifications",
  ],
};

export const EXPECTED_FUNCTIONS: string[] = [
  "mfa_mutation_allowed",
  "get_public_status_page",
  "create_status_page_with_monitors",
  "update_status_page_with_monitors",
];

/** Policies that must exist. Their absence means a migration was not applied. */
export const EXPECTED_POLICIES: string[] = [
  "MFA required for monitor writes",
  "MFA required for status page writes",
  "Users can manage own monitor notifs",
  "Users can manage own maintenance monitors",
  "Users can manage own status page monitors",
];

/**
 * Policies that must NOT exist. `System insert heartbeats` would let any
 * caller forge a heartbeat for a monitor they do not own, so the gate treats
 * its presence as a hard failure even though nothing expects it.
 */
export const FORBIDDEN_POLICIES: string[] = ["System insert heartbeats"];
