import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  EXPECTED_COLUMNS,
  EXPECTED_FUNCTIONS,
  EXPECTED_POLICIES,
} from "../../scripts/supabase-expected-schema";
import { main } from "../../scripts/supabase-verify-schema";

/**
 * The schema-drift gate.
 *
 * This is the check that stands between a migration that did not apply and
 * a dashboard full of 500s. It has never been run against a database that
 * had actually drifted, which means the drift path — the one that matters
 * — was the one that was never exercised.
 *
 * The transport is stubbed, so nothing here touches a real project.
 */

type Call = { url: string; sql: string | null };

let calls: Call[] = [];
let originalFetch: typeof globalThis.fetch;
let originalToken: string | undefined;
let originalRef: string | undefined;

/** Answer each of the gate's three questions from the given answers. */
function stub(
  options: {
    columns?: Record<string, string[]>;
    functions?: string[];
    policies?: string[];
    status?: number;
  } = {},
) {
  const columns = options.columns ?? {};

  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { query: string })
        : null;
    const sql = body?.query ?? "";
    calls.push({ url, sql });

    if (options.status && options.status !== 200) {
      return new Response("denied", { status: options.status });
    }

    if (sql.includes("information_schema.columns")) {
      const table = /table_name='([^']+)'/.exec(sql)?.[1] ?? "";
      return new Response(
        JSON.stringify(
          (columns[table] ?? []).map((column_name) => ({ column_name })),
        ),
        { status: 200 },
      );
    }
    if (sql.includes("information_schema.routines")) {
      return new Response(
        JSON.stringify(
          (options.functions ?? []).map((routine_name) => ({ routine_name })),
        ),
        { status: 200 },
      );
    }
    if (sql.includes("pg_policies")) {
      return new Response(
        JSON.stringify(
          (options.policies ?? []).map((policyname) => ({ policyname })),
        ),
        { status: 200 },
      );
    }
    return new Response("[]", { status: 200 });
  }) as typeof globalThis.fetch;
}

/** The database as it should look: everything the gate expects. */
function healthyDatabase() {
  const columns: Record<string, string[]> = {};
  for (const [table, cols] of Object.entries(EXPECTED_COLUMNS)) {
    columns[table] = cols;
  }
  return {
    columns,
    functions: EXPECTED_FUNCTIONS,
    policies: EXPECTED_POLICIES,
  };
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  originalToken = Bun.env.SUPABASE_ACCESS_TOKEN;
  originalRef = Bun.env.SUPABASE_PROJECT_REF;
  Bun.env.SUPABASE_ACCESS_TOKEN = "sbp_test-token";
  Bun.env.SUPABASE_PROJECT_REF = "test-project-ref";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete Bun.env.SUPABASE_ACCESS_TOKEN;
  else Bun.env.SUPABASE_ACCESS_TOKEN = originalToken;
  if (originalRef === undefined) delete Bun.env.SUPABASE_PROJECT_REF;
  else Bun.env.SUPABASE_PROJECT_REF = originalRef;
});

describe("the schema drift gate", () => {
  it("refuses to run without credentials", async () => {
    delete Bun.env.SUPABASE_PROJECT_REF;
    stub();

    expect(await main()).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("passes when the database has everything it expects", async () => {
    stub(healthyDatabase());

    expect(await main()).toBe(0);
  });

  it("fails when a column is missing", async () => {
    const database = healthyDatabase();
    database.columns.monitors = database.columns.monitors.filter(
      (column) => column !== "ssl_expiry",
    );
    stub(database);

    // The drift the gate exists to catch.
    expect(await main()).toBe(2);
  });

  it("fails when a whole table is missing", async () => {
    const database = healthyDatabase();
    database.columns.monitors = [];
    stub(database);

    expect(await main()).toBe(2);
  });

  it("fails when a function is missing", async () => {
    const database = healthyDatabase();
    database.functions = database.functions.filter(
      (name) => name !== "get_public_status_page",
    );
    stub(database);

    expect(await main()).toBe(2);
  });

  it("fails when a policy is missing", async () => {
    const database = healthyDatabase();
    database.policies = database.policies.filter(
      (name) => name !== "MFA required for monitor writes",
    );
    stub(database);

    expect(await main()).toBe(2);
  });

  it("fails when a forbidden policy is present", async () => {
    // `System insert heartbeats` would let any caller forge a heartbeat
    // for a monitor they do not own. Its presence is a hard failure even
    // though nothing expects it.
    const database = healthyDatabase();
    database.policies = [...database.policies, "System insert heartbeats"];
    stub(database);

    expect(await main()).toBe(2);
  });

  it("reports an unreadable database as unreadable, not as drift", async () => {
    stub({ status: 500 });

    // An unreadable database is not a drifted one. Reporting it as drift
    // would send an operator hunting a migration that was applied
    // perfectly well.
    expect(await main()).toBe(3);
  });
});
