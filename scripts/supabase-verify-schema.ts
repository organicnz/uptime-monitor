#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Verify the live database matches the expected post-migration schema.
 *
 * Used as a CI gate after `scripts/supabase-migrate.ts` so drift is caught
 * automatically instead of surfacing as runtime 500s. Exits non-zero when any
 * expected column, function or policy is missing.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN - Supabase personal access token (sbp_...)
 *   SUPABASE_PROJECT_REF  - Project ref, e.g. bfokpatpfqgrxbrgrefp
 *
 * Exit codes:
 *   0 - live schema matches expectations
 *   1 - missing env
 *   2 - drift detected
 *   3 - the live database could not be read
 */
import {
  EXPECTED_COLUMNS,
  EXPECTED_FUNCTIONS,
  EXPECTED_POLICIES,
  FORBIDDEN_POLICIES,
} from "./supabase-expected-schema";

const API_BASE = "https://api.supabase.com/v1";
const QUERY_TIMEOUT_MS = 60_000;

type MgmtRow = Record<string, unknown>;

async function mgmtQuery(
  token: string,
  ref: string,
  sql: string,
): Promise<MgmtRow[]> {
  const response = await fetch(`${API_BASE}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
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
      "Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF, failing.",
    );
    return 1;
  }

  let ok = true;

  // An unreadable database is not a drifted one. Letting the query error
  // escape as an exception would report a network blip as a stack trace
  // and send an operator hunting a migration that was applied perfectly
  // well, so the two are told apart.
  try {
    for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
      const rows = await mgmtQuery(
        token,
        ref,
        "SELECT column_name FROM information_schema.columns " +
          `WHERE table_schema='public' AND table_name='${table}'`,
      );
      const present = new Set(rows.map((row) => String(row.column_name)));
      const missing = cols.filter((col) => !present.has(col));
      if (missing.length > 0) {
        ok = false;
        console.error(`FAIL ${table}: missing ${missing.join(", ")}`);
      } else {
        console.log(`OK ${table}: all ${cols.length} expected columns present`);
      }
    }

    const functionRows = await mgmtQuery(
      token,
      ref,
      "SELECT routine_name FROM information_schema.routines " +
        "WHERE routine_schema='public'",
    );
    const presentFunctions = new Set(
      functionRows.map((row) => String(row.routine_name)),
    );
    const missingFunctions = EXPECTED_FUNCTIONS.filter(
      (name) => !presentFunctions.has(name),
    );
    if (missingFunctions.length > 0) {
      ok = false;
      console.error(`FAIL functions: missing ${missingFunctions.join(", ")}`);
    } else {
      console.log(
        `OK functions: all ${EXPECTED_FUNCTIONS.length} expected functions present`,
      );
    }

    const policyRows = await mgmtQuery(
      token,
      ref,
      "SELECT policyname FROM pg_policies WHERE schemaname='public'",
    );
    const presentPolicies = new Set(
      policyRows.map((row) => String(row.policyname)),
    );
    const missingPolicies = EXPECTED_POLICIES.filter(
      (name) => !presentPolicies.has(name),
    );
    const forbiddenPolicies = FORBIDDEN_POLICIES.filter((name) =>
      presentPolicies.has(name),
    );
    if (missingPolicies.length > 0 || forbiddenPolicies.length > 0) {
      ok = false;
      if (missingPolicies.length > 0) {
        console.error(`FAIL policies: missing ${missingPolicies.join(", ")}`);
      }
      if (forbiddenPolicies.length > 0) {
        console.error(
          `FAIL policies: forbidden ${forbiddenPolicies.join(", ")}`,
        );
      }
    } else {
      console.log(
        `OK policies: all ${EXPECTED_POLICIES.length} expected policies present`,
      );
    }
  } catch (error) {
    console.error(
      "Could not read the live database: " +
        `${error instanceof Error ? error.message : String(error)}. ` +
        "This is not drift: the schema was not checked.",
    );
    return 3;
  }

  console.log(ok ? "Schema verification passed" : "Schema verification FAILED");
  return ok ? 0 : 2;
}

// `process.exitCode` rather than `process.exit()`: Bun flushes pending writes
// before the process ends, so the verification report is never truncated when
// the output is piped into a CI log.
// `import.meta.main` so that a test can import `main` and drive it with a
// stubbed transport: this script decides whether the live database has
// drifted, and a gate that has never been run against a drifted database
// is a gate that has never been tested.
if (import.meta.main) {
  process.exitCode = await main();
}
