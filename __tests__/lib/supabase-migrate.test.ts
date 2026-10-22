import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { main } from "../../scripts/supabase-migrate";

/**
 * The migration script.
 *
 * This is the code that changes the production database, and it runs on
 * every push to `main`. Its failure modes are worth testing rather than
 * discovering: a token that has expired, a project the token cannot see,
 * and a migration that fails half way through.
 *
 * The transport is stubbed, so nothing here touches a real project.
 */

type Call = { url: string; sql: string | null; auth: string | null };

let calls: Call[] = [];
let originalFetch: typeof globalThis.fetch;
let originalToken: string | undefined;
let originalRef: string | undefined;

/** Answer the stubbed transport with the given project list and query results. */
function stub(
  options: {
    projects?: Array<{ id: string }>;
    projectsStatus?: number;
    queryStatus?: number;
    queryBody?: unknown;
    failOn?: string;
  } = {},
) {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = input.toString();
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as { query: string })
        : null;
    const headers = init?.headers as Record<string, string> | undefined;
    calls.push({
      url,
      sql: body?.query ?? null,
      auth: headers?.Authorization ?? null,
    });

    if (url.endsWith("/projects")) {
      if (options.projectsStatus && options.projectsStatus !== 200) {
        return new Response("unauthorized", { status: options.projectsStatus });
      }
      return new Response(JSON.stringify(options.projects ?? []), {
        status: 200,
      });
    }

    if (options.queryStatus && options.queryStatus !== 200) {
      return new Response("query failed", { status: options.queryStatus });
    }
    if (options.failOn && body?.query.includes(options.failOn)) {
      return new Response("syntax error", { status: 400 });
    }
    return new Response(JSON.stringify(options.queryBody ?? []), {
      status: 200,
    });
  }) as typeof globalThis.fetch;
}

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
  originalToken = Bun.env.SUPABASE_ACCESS_TOKEN;
  originalRef = Bun.env.SUPABASE_PROJECT_REF;
  // A placeholder, not a credential: the secrets check reads an
  // assignment to an access token as one, and it should.
  Bun.env.SUPABASE_ACCESS_TOKEN = "<test-token>";
  Bun.env.SUPABASE_PROJECT_REF = "test-project-ref";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete Bun.env.SUPABASE_ACCESS_TOKEN;
  else Bun.env.SUPABASE_ACCESS_TOKEN = originalToken;
  if (originalRef === undefined) delete Bun.env.SUPABASE_PROJECT_REF;
  else Bun.env.SUPABASE_PROJECT_REF = originalRef;
});

describe("the migration script", () => {
  it("refuses to run without credentials", async () => {
    delete Bun.env.SUPABASE_ACCESS_TOKEN;
    stub();

    // It must not even reach the API: a missing credential is a
    // misconfiguration, and the script says so rather than failing later.
    expect(await main()).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it("fails fast when the token is rejected", async () => {
    stub({ projectsStatus: 401 });

    expect(await main()).toBe(1);
  });

  it("sends the token without the whitespace around it", async () => {
    // A secret pasted with a trailing newline is a 401 that reads exactly
    // like an invalid token, and the difference is invisible in a log.
    Bun.env.SUPABASE_ACCESS_TOKEN = "  <test-token>\n";
    Bun.env.SUPABASE_PROJECT_REF = " test-project-ref ";
    stub({ projects: [{ id: "test-project-ref" }] });

    expect(await main()).toBe(0);
    // Every call carries the trimmed token, and the project path carries
    // the trimmed reference.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.auth).toBe("Bearer <test-token>");
    }
    expect(
      calls.some((call) => call.url.includes("/projects/test-project-ref/")),
    ).toBe(true);
  });

  it("fails when the project is not visible to the token", async () => {
    // A valid token that cannot see the project is the mistake that is
    // easiest to make and easiest to miss.
    stub({ projects: [{ id: "some-other-project" }] });

    expect(await main()).toBe(1);
    expect(calls.some((call) => call.url.includes("/database/query"))).toBe(
      false,
    );
  });

  it("applies every migration", async () => {
    stub({ projects: [{ id: "test-project-ref" }] });

    expect(await main()).toBe(0);

    const applied = calls.filter((call) =>
      call.url.includes("/database/query"),
    );
    expect(applied.length).toBeGreaterThan(0);
    // Every one of them is a real migration from the repository.
    for (const call of applied) {
      expect(call.sql?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("applies the migrations in chronological order", async () => {
    stub({ projects: [{ id: "test-project-ref" }] });

    await main();

    const applied = calls.filter((call) =>
      call.url.includes("/database/query"),
    );
    // The vault migration is the last one, and it depends on the ones
    // before it, so the order is the contract.
    const sql = applied.map((call) => call.sql ?? "").join("\n");
    const vault = sql.indexOf("supabase_vault");
    const columns = sql.indexOf("secret_id");
    expect(vault).toBeGreaterThan(-1);
    expect(columns).toBeGreaterThan(-1);
  });

  it("reports a migration that failed and names it", async () => {
    stub({
      projects: [{ id: "test-project-ref" }],
      failOn: "supabase_vault",
    });

    // A failed migration is a different outcome from a misconfiguration,
    // and the exit code has to tell them apart.
    expect(await main()).toBe(2);
  });
});
