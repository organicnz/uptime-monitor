#!/usr/bin/env python3
"""Apply supabase/migrations/*.sql via the Supabase Management API.

Used by .github/workflows/supabase-migrations.yml so CI/CD needs no manual
SQL Editor steps. All migration files must stay idempotent (IF NOT EXISTS /
DROP POLICY IF EXISTS) so re-runs are safe.

Env:
  SUPABASE_ACCESS_TOKEN - Supabase personal access token (sbp_...)
  SUPABASE_PROJECT_REF  - Project ref, e.g. bfokpatpfqgrxbrgrefp
                          (derived from https://<ref>.supabase.co)

Exit codes:
  0 - all migration files applied
  1 - misconfiguration (missing env)
  2 - one or more migrations failed
"""

import glob
import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = "https://api.supabase.com/v1"


def mgmt_query(token: str, ref: str, sql: str, timeout: int = 120):
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
        print(
            "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF env vars, "
            "skipping SQL migration (no credentials).",
            flush=True,
        )
        return 1

    files = sorted(glob.glob("supabase/migrations/*.sql"))
    if not files:
        print("No migration files found, nothing to do.")
        return 0

    # Pre-flight: validate the token before attempting any migration so a
    # bad/expired secret fails fast with an actionable message instead of
    # per-file 401s.
    try:
        req = urllib.request.Request(
            f"{API_BASE}/projects",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            projects = json.load(resp)
        refs = {p.get("id") for p in projects}
        if ref not in refs:
            print(
                f"SUPABASE_PROJECT_REF '{ref}' not visible to this token. "
                f"Check the secret value and project ref.",
                flush=True,
            )
            return 1
        print(f"Token OK, project '{ref}' accessible.", flush=True)
    except urllib.error.HTTPError as e:
        print(
            f"Token validation failed: HTTP {e.code} "
            f"{e.read().decode()[:200]}. "
            f"Rotate SUPABASE_ACCESS_TOKEN secret.",
            flush=True,
        )
        return 1

    print(f"Found {len(files)} migration files")
    failures: list[str] = []
    for path in files:
        name = os.path.basename(path)
        sql = open(path, encoding="utf-8").read()
        if not sql.strip():
            print(f"=== Skipping (empty): {name} ===")
            continue
        print(f"=== Applying: {name} ({len(sql)} chars) ===", flush=True)
        try:
            mgmt_query(token, ref, sql)
            print(f"OK: {name} applied successfully", flush=True)
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:500]
            print(f"FAILED: {name} HTTP {e.code}: {detail}", flush=True)
            failures.append(name)
        except Exception as e:  # network etc.
            print(f"FAILED: {name}: {str(e)[:300]}", flush=True)
            failures.append(name)

    if failures:
        print(f"Migration failures: {', '.join(failures)}", flush=True)
        return 2
    print("All migrations applied successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())
