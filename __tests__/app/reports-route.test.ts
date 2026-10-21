import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const auth = {
  user: { id: "user-1" } as Record<string, unknown> | null,
  error: null as { message: string } | null,
  currentAal: "aal1",
  nextAal: "aal1",
};

/**
 * Stub shaped like the Supabase query builder, in the same style as
 * __tests__/lib/uptime-reports.test.ts. The real report generators run against
 * it: mocking the generators instead would collide with that file, since bun's
 * mock.module rewrites the process-wide registry and a static importer of the
 * real module gets the mock too.
 */
type Row = Record<string, unknown>;

const tables: Record<string, { data: unknown; error: unknown }> = {};

function queryChain(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.gte = self;
  chain.order = self;
  chain.limit = async () => tables[table];
  chain.maybeSingle = async () => tables[table];
  return chain;
}

mock.module("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user }, error: auth.error }),
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: auth.currentAal, nextLevel: auth.nextAal },
          error: null,
        }),
      },
    },
    from: (table: string) => queryChain(table),
  }),
}));

const { GET, POST } = await import("@/app/api/reports/route");

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const HEARTBEAT_AT = new Date().toISOString();

function get(query: string) {
  return new Request(`http://localhost/api/reports${query}`) as never;
}

function post(body: unknown) {
  return new Request("http://localhost/api/reports", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  auth.user = { id: "user-1" };
  auth.error = null;
  auth.currentAal = "aal1";
  auth.nextAal = "aal1";
  tables.monitors = { data: { id: UUID, name: "API" }, error: null };
  tables.heartbeats = {
    data: [{ status: 1, ping: 100, duration: 100, time: HEARTBEAT_AT }],
    error: null,
  };
  tables.heartbeat_daily = { data: [], error: null };
  tables.incidents = { data: [], error: null };
});

afterEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
});

describe("GET /api/reports", () => {
  it("returns the report with the caller's id", async () => {
    const response = await GET(get(`?monitorId=${UUID}&period=7d`));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      monitorId: UUID,
      monitorName: "API",
      period: "7d",
      userId: "user-1",
      uptimePercent: 100,
      avgResponseTimeMs: 100,
    });
  });

  it("defaults to a 24h window", async () => {
    const response = await GET(get(`?monitorId=${UUID}`));

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.period).toBe("24h");
  });

  it("rejects a missing or non-uuid monitorId", async () => {
    const missing = await GET(get(""));
    const malformed = await GET(get("?monitorId=not-a-uuid"));
    const wrongPeriod = await GET(get(`?monitorId=${UUID}&period=7w`));

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(wrongPeriod.status).toBe(400);
  });

  it("reports a monitor the caller cannot see as 404", async () => {
    tables.monitors = { data: null, error: null };

    const response = await GET(get(`?monitorId=${UUID}`));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Monitor not found",
    });
  });

  it("does not dress a failed read up as a missing monitor", async () => {
    tables.heartbeats = { data: null, error: { message: "read failed" } };

    const response = await GET(get(`?monitorId=${UUID}`));

    expect(response.status).toBe(500);
  });

  it("rejects an unauthenticated caller", async () => {
    auth.user = null;

    const response = await GET(get(`?monitorId=${UUID}`));

    expect(response.status).toBe(401);
  });

  it("requires MFA like every other dashboard API", async () => {
    // An elevated nextLevel with the session still at aal1 is the state that
    // means "password accepted, second factor not yet supplied".
    auth.currentAal = "aal1";
    auth.nextAal = "aal2";

    const response = await GET(get(`?monitorId=${UUID}`));

    expect(response.status).toBe(403);
  });

  it("allows a caller who has already verified the second factor", async () => {
    auth.currentAal = "aal2";
    auth.nextAal = "aal2";

    const response = await GET(get(`?monitorId=${UUID}`));

    expect(response.status).toBe(200);
  });
});

describe("POST /api/reports", () => {
  it("returns bulk reports for the requested window", async () => {
    const response = await POST(post({ monitorIds: [UUID], period: "30d" }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.period).toBe("30d");
    expect(body.reports as Row[]).toHaveLength(1);
  });

  it("rejects an empty list", async () => {
    const response = await POST(post({ monitorIds: [] }));

    expect(response.status).toBe(400);
  });

  it("rejects a list longer than the cap", async () => {
    const response = await POST(
      post({ monitorIds: Array.from({ length: 51 }, () => UUID) }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a malformed body", async () => {
    const response = await POST(post("not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON body",
    });
  });

  it("skips monitors the caller cannot see instead of failing the batch", async () => {
    tables.monitors = { data: null, error: null };

    const response = await POST(post({ monitorIds: [UUID] }));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.reports as Row[]).toHaveLength(0);
  });

  it("rejects an unauthenticated caller", async () => {
    auth.error = { message: "invalid" };

    const response = await POST(post({ monitorIds: [UUID] }));

    expect(response.status).toBe(401);
  });
});
