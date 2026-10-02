import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

// The backdrop is a WebGPU canvas with its own no-adapter fallback; it has
// nothing to do with how a status is worded.
mock.module("@/components/gpu-status-background-client", () => ({
  GPUStatusBackground: () => null,
}));

type PublicRow = {
  id: string;
  title: string;
  description: string | null;
  custom_domain: string | null;
  monitor_id: string;
  monitor_name: string;
  monitor_type: string;
  status: number;
  ping: number | null;
};

const rpc = { data: [] as PublicRow[], error: null };

mock.module("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => rpc,
  }),
}));

const PublicStatusPage = (await import("@/app/status/[slug]/page")).default;

async function renderPage(statuses: number[]) {
  rpc.data = statuses.map((status, index) => ({
    id: "page-1",
    title: "Acme Status",
    description: null,
    custom_domain: null,
    monitor_id: `monitor-${index}`,
    monitor_name: `Service ${index}`,
    monitor_type: "http",
    status,
    ping: 120,
  }));

  const tree = await PublicStatusPage({
    params: Promise.resolve({ slug: "acme" }),
  });
  return render(tree);
}

afterEach(() => {
  cleanup();
});

describe("public status page", () => {
  it("reports an all-clear when every monitor is up", async () => {
    await renderPage([1, 1]);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "All Systems Operational",
      }),
    ).toBeDefined();
    expect(screen.getAllByText("Operational")).toHaveLength(2);
  });

  it("does not call a slow-but-answering monitor an outage", async () => {
    // The regression this guards: DEGRADED used to fall through every `isUp`
    // check, so one slow service announced "Partial Outage" on the public page.
    await renderPage([1, 4]);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Degraded Performance",
      }),
    ).toBeDefined();
    expect(screen.queryByText("Partial Outage")).toBeNull();
    expect(
      screen.getByText("Some services are responding slower than usual."),
    ).toBeDefined();
  });

  it("labels a degraded monitor distinctly rather than unknown", async () => {
    await renderPage([4]);

    expect(screen.getByText("Degraded")).toBeDefined();
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("still reports a genuine outage", async () => {
    await renderPage([1, 0]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Systems Down" }),
    ).toBeDefined();
    expect(
      screen.getByText("Some services are currently experiencing issues."),
    ).toBeDefined();
  });

  it("lets a real outage outrank degradation", async () => {
    await renderPage([4, 0]);

    expect(
      screen.getByRole("heading", { level: 2, name: "Systems Down" }),
    ).toBeDefined();
    // The degraded monitor is still labelled as such, not as up.
    expect(screen.getByText("Degraded")).toBeDefined();
  });
});
