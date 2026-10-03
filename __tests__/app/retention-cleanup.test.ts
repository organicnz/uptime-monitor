import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { HEARTBEAT_RAW_RETENTION_DAYS } from "@/lib/uptime-reports";

const rpc = {
  data: [{ rolled_up_days: 2, deleted_rows: 10 }] as unknown,
  error: null as { message: string } | null,
  calls: [] as unknown[],
};

mock.module("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (_name: string, args: unknown) => {
      rpc.calls.push(args);
      return { data: rpc.data, error: rpc.error };
    },
  }),
}));

const { POST, GET } = await import("@/app/api/cron/cleanup/route");

function request(url: string, method: "GET" | "POST" = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { authorization: "Bearer test-cron-secret" },
  }) as never;
}

beforeEach(() => {
  rpc.calls = [];
  rpc.error = null;
  rpc.data = [{ rolled_up_days: 2, deleted_rows: 10 }];
  process.env.CRON_SECRET = "test-cron-secret";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("retention cleanup", () => {
  it("rolls up and deletes at the report's raw window", async () => {
    const response = await POST(request("/api/cron/cleanup"));

    expect(response.status).toBe(200);
    expect(rpc.calls[0]).toMatchObject({
      p_retention_days: HEARTBEAT_RAW_RETENTION_DAYS,
    });
  });

  it("rejects a retention that would leave days uncovered", async () => {
    // Rollups only cover days older than the cutoff, and the report only reads
    // raw rows for the last HEARTBEAT_RAW_RETENTION_DAYS. Any other cutoff
    // leaves days in between counted by neither, so 30d/90d uptime would drop
    // them silently.
    const response = await POST(request("/api/cron/cleanup?retentionDays=30"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toHaveProperty(
      "error",
      expect.stringContaining(String(HEARTBEAT_RAW_RETENTION_DAYS)),
    );
    expect(rpc.calls).toHaveLength(0);
  });

  it("rejects a shortened retention for the same reason", async () => {
    const response = await GET(
      request("/api/cron/cleanup?retentionDays=3", "GET"),
    );

    expect(response.status).toBe(400);
    expect(rpc.calls).toHaveLength(0);
  });

  it("still allows tuning the batch bounds", async () => {
    const response = await POST(
      request("/api/cron/cleanup?batchSize=250&maxBatches=3"),
    );

    expect(response.status).toBe(200);
    expect(rpc.calls[0]).toMatchObject({
      p_batch_size: 250,
      p_max_batches: 3,
    });
  });

  it("rejects an unauthenticated call before doing anything", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/cleanup", {
        method: "POST",
      }) as never,
    );

    expect(response.status).toBe(401);
    expect(rpc.calls).toHaveLength(0);
  });
});
