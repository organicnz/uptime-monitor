import { cleanup, render, screen } from "@testing-library/react";
import { MonitorCard } from "@/components/ui/monitor-card";

afterEach(() => {
  cleanup();
});

describe("MonitorCard", () => {
  const mockMonitor = {
    id: "mon-1",
    name: "HTTP Monitor",
    url: "https://example.com",
    hostname: null,
    type: "http",
    interval: 60,
    active: true,
    status: "up" as const,
    ping: 42,
  };

  const mockOnViewDetail = () => {};

  it("renders monitor name", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const nameElement = screen.getByRole("heading", {
      name: "HTTP Monitor monitor",
    });
    expect(nameElement).toBeDefined();
  });

  it("renders monitor URL endpoint", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const urlElement = screen.getByText("https://example.com");
    expect(urlElement).toBeDefined();
  });

  it("applies accessible aria-label to card container", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const cardContainer = screen.getByRole("article", {
      name: "Monitor: HTTP Monitor",
    });
    expect(cardContainer).toBeDefined();
  });

  it("applies accessible aria-label to link", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const link = screen.getByRole("link", {
      name: `View monitor details for HTTP Monitor`,
    });
    expect(link).toBeDefined();
  });

  it("renders status up with check icon", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const icon = screen.getByRole("img", { name: "Operational" });
    expect(icon).toBeDefined();
  });

  it("renders actions menu trigger", () => {
    render(
      <MonitorCard monitor={mockMonitor} onViewDetail={mockOnViewDetail} />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger).toBeDefined();
  });
});
