import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const auth = {
  user: { id: "user-1" } as Record<string, unknown> | null,
};

mock.module("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: auth.user }, error: null }),
    },
  }),
}));

/**
 * Chainable stub that records the filters it was given. The route reads through
 * the service-role client, so this hand-rolled `user_id` comparison is the only
 * thing keeping one tenant's monitors out of another tenant's reach; recording
 * the filters is what makes that assertable.
 */
const queries: { table: string; filters: Record<string, string> }[] = [];
const monitorRow = {
  value: { id: "monitor-1", user_id: "user-1", active: true } as unknown,
};

mock.module("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const state = { filters: {} as Record<string, string>, table: "" };
    const chain = {
      select() {
        return chain;
      },
      eq(column: string, value: string) {
        state.filters[column] = value;
        return chain;
      },
      maybeSingle: async () => ({ data: monitorRow.value, error: null }),
    };
    return {
      from(table: string) {
        state.table = table;
        queries.push({
          table,
          get filters() {
            return state.filters;
          },
        } as never);
        return chain;
      },
    };
  },
}));

const checker = {
  calls: [] as unknown[],
  error: null as unknown,
};

mock.module("@/lib/monitor-checker", () => ({
  processMonitorCheck: async (
    monitor: unknown,
    deadline: unknown,
    options: unknown,
  ) => {
    checker.calls.push({ monitor, deadline, options });
    if (checker.error) throw checker.error;
  },
}));

const { POST } = await import("@/app/api/monitors/[id]/check/route");

const MONITOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function post(body?: unknown) {
  return new Request(`http://localhost/api/monitors/${MONITOR_ID}/check`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

function invoke(body?: unknown) {
  return POST(post(body), {
    params: Promise.resolve({ id: MONITOR_ID }),
  });
}

beforeEach(() => {
  auth.user = { id: "user-1" };
  monitorRow.value = { id: MONITOR_ID, user_id: "user-1", active: true };
  checker.calls = [];
  checker.error = null;
  queries.length = 0;
});

afterEach(() => {
  checker.calls = [];
  queries.length = 0;
});

describe("POST /api/monitors/[id]/check", () => {
  it("scopes the read to the calling user", async () => {
    const response = await invoke();

    expect(response.status).toBe(200);
    expect(queries[0]?.table).toBe("monitors");
    expect(queries[0]?.filters).toMatchObject({
      id: MONITOR_ID,
      user_id: "user-1",
    });
  });

  it("attributes the heartbeat to the user who asked for it", async () => {
    await invoke();

    // This is what fills heartbeats.checked_by, and it has to be the caller
    // rather than anything derived from the monitor row.
    expect(checker.calls[0]).toMatchObject({
      options: { triggeredBy: "user-1" },
    });
  });

  it("rejects an unauthenticated caller before touching the database", async () => {
    auth.user = null;

    const response = await invoke();

    expect(response.status).toBe(401);
    expect(queries).toHaveLength(0);
    expect(checker.calls).toHaveLength(0);
  });

  it("returns 404 rather than checking a monitor the caller does not own", async () => {
    // The service-role client bypasses RLS, so a monitor row belonging to
    // another tenant resolves to nothing under the user_id filter above.
    monitorRow.value = null;

    const response = await invoke();

    expect(response.status).toBe(404);
    expect(checker.calls).toHaveLength(0);
  });

  it("refuses an inactive monitor unless forced", async () => {
    monitorRow.value = { id: MONITOR_ID, user_id: "user-1", active: false };

    const refused = await invoke();
    const forced = await invoke({ force: true });

    expect(refused.status).toBe(400);
    await expect(refused.json()).resolves.toMatchObject({
      error: "Monitor is inactive. Use force=true to check anyway.",
    });
    expect(forced.status).toBe(200);
    expect(checker.calls).toHaveLength(1);
  });

  it("accepts a request with no body at all", async () => {
    const response = await invoke();

    expect(response.status).toBe(200);
  });

  it("rejects a body of the wrong shape", async () => {
    const response = await invoke({ force: "yes" });

    expect(response.status).toBe(400);
    expect(checker.calls).toHaveLength(0);
  });

  it("surfaces a failing check as a 500", async () => {
    checker.error = new Error("monitor blew up");

    const response = await invoke();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "Check failed",
      message: "monitor blew up",
    });
  });
});
