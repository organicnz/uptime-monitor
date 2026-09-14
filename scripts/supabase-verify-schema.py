#!/usr/bin/env python3
"""Verify the live database matches the expected post-migration schema.

Used as a CI gate after scripts/supabase-migrate.py so drift is caught
automatically instead of surfacing as runtime 500s. Exits non-zero when any
expected column is missing.

Env:
  SUPABASE_ACCESS_TOKEN - Supabase personal access token (sbp_...)
  SUPABASE_PROJECT_REF  - Project ref, e.g. bfokpatpfqgrxbrgrefp
"""

import json
import os
import sys
import urllib.request

API_BASE = "https://api.supabase.com/v1"

EXPECTED: dict[str, list[str]] = {
    "monitors": [
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
    "heartbeats": [
        "rtt_ms",
        "ssl_valid",
        "error_type",
        "ip_resolved",
        "status_reason",
        "checked_by",
    ],
    "incidents": ["severity", "source", "resolved_by", "acknowledgment_at"],
    "profiles": [
        "last_check_at",
        "email_notifications",
        "telegram_notifications",
        "discord_notifications",
        "slack_notifications",
        "webhook_notifications",
        "pushover_notifications",
        "teams_notifications",
    ],
}


def mgmt_query(token: str, ref: str, sql: str, timeout: int = 60):
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/projects/{ref}/database/query",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    ref = os.environ.get("SUPABASE_PROJECT_REF", "")
    if not token or not ref:
        print("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF, failing.")
        return 1

    ok = True
    for table, cols in EXPECTED.items():
        rows = mgmt_query(
            token,
            ref,
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{table}'",
        )
        present = {r["column_name"] for r in rows}
        missing = [c for c in cols if c not in present]
        if missing:
            ok = False
            print(f"FAIL {table}: missing {missing}")
        else:
            print(f"OK {table}: all {len(cols)} expected columns present")
    print("Schema verification passed" if ok else "Schema verification FAILED")
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
