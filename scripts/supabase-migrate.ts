#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Apply `supabase/migrations/*.sql` via the Supabase Management API.
 *
 * Used by `.github/workflows/supabase-migrations.yml` so CI/CD needs no manual
 * SQL Editor steps. All migration files must stay idempotent (IF NOT EXISTS /
 * DROP POLICY IF EXISTS) so re-runs are safe.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN - Supabase personal access token (sbp_...)
 *   SUPABASE_PROJECT_REF  - Project ref, e.g. bfokpatpfqgrxbrgrefp
 *                          (derived from https://<ref>.supabase.co)
 *
 * Exit codes:
 *   0 - all migration files applied
 *   1 - misconfiguration (missing env) or an unreachable/invalid token
 *   2 - one or more migrations failed
 */
import { readFile } from "bun:fs/promises";
import { basename, join } from "bun:path";

const API_BASE = "https://api.supabase.com/v1";
const MIGRATIONS_DIR = join(import.meta.dir, "..", "supabase", "migrations");
const QUERY_TIMEOUT_MS = 120_000;

// `Bun.Glob` is the runtime's own matcher: one traversal, and the paths
// that match come back already filtered.
const MIGRATIONS = new Bun.Glob("*.sql");

type MgmtRow = Record<string, unknown>;

async function mgmtQuery(
  token: string,
  ref: string,
  sql: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<MgmtRow[]> {
  const response = await fetch(`${API_BASE}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  return (await response.json()) as MgmtRow[];
}

export async function main(): Promise<number> {
  const token = Bun.env.SUPABASE_ACCESS_TOKEN ?? "";
  const ref = Bun.env.SUPABASE_PROJECT_REF ?? "";

  if (!token || !ref) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF env vars, " +
        "skipping SQL migration (no credentials).",
    );
    return 1;
  }

  const files = [...MIGRATIONS.scanSync(MIGRATIONS_DIR)].sort();

  if (files.length === 0) {
    console.log("No migration files found, nothing to do.");
    return 0;
  }

  // Pre-flight: validate the token before attempting any migration so a
  // bad/expired secret fails fast with an actionable message instead of
  // per-file 401s.
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      throw new Error(`HTTP ${response.status} ${detail}`);
    }
    const projects = (await response.json()) as { id?: string }[];
    const refs = new Set(projects.map((project) => project.id));
    if (!refs.has(ref)) {
      console.error(
        `SUPABASE_PROJECT_REF '${ref}' not visible to this token. ` +
          `Check the secret value and project ref.`,
      );
      return 1;
    }
    console.log(`Token OK, project '${ref}' accessible.`);
  } catch (error) {
    console.error(
      `Token validation failed: ${error instanceof Error ? error.message : String(error)}. ` +
        `Rotate SUPABASE_ACCESS_TOKEN secret.`,
    );
    return 1;
  }

  console.log(`Found ${files.length} migration files`);

  const failures: string[] = [];
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    if (!sql.trim()) {
      console.log(`=== Skipping (empty): ${file} ===`);
      continue;
    }
    console.log(`=== Applying: ${file} (${sql.length} chars) ===`);
    try {
      await mgmtQuery(token, ref, sql);
      console.log(`OK: ${file} applied successfully`);
    } catch (error) {
      console.error(
        `FAILED: ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failures.push(basename(file));
    }
  }

  if (failures.length > 0) {
    console.error(`Migration failures: ${failures.join(", ")}`);
    return 2;
  }

  console.log("All migrations applied successfully");
  return 0;
}

// `process.exitCode` rather than `process.exit()`: Bun flushes pending writes
// before the process ends, so the migration log is never truncated when the
// output is piped into a CI log.
// `import.meta.main` so that a test can import `main` and drive it with a
// stubbed transport: this script changes the production database, and its
// failure modes — a bad token, a project the token cannot see, a migration
// that fails half way — deserve to be tested rather than discovered.
if (import.meta.main) {
  process.exitCode = await main();
}
