import { cleanup, render, screen } from "@testing-library/react";
import { ResponseChart } from "@/components/ui/response-chart";

afterEach(() => {
  cleanup();
});

describe("ResponseChart", () => {
  const mockHeartbeats = [
    { ping: 42, time: new Date().toISOString() },
    { ping: 58, time: new Date(Date.now() - 60000).toISOString() },
    { ping: 33, time: new Date(Date.now() - 120000).toISOString() },
  ];

  const mockMaxPing = 100;

  it("renders chart with heartbeats data", () => {
    render(<ResponseChart heartbeats={mockHeartbeats} maxPing={mockMaxPing} />);
    const chartSvg = screen.getByRole("img", { name: "Response time chart" });
    expect(chartSvg).toBeDefined();
  });

  it("renders 'Not enough data' when less than 2 heartbeats", () => {
    const sparseHeartbeats = [{ ping: 42, time: new Date().toISOString() }];
    render(
      <ResponseChart heartbeats={sparseHeartbeats} maxPing={mockMaxPing} />,
    );
    const notEnoughData = screen.getByRole("status");
    expect(notEnoughData).toBeDefined();
    expect(notEnoughData.textContent).toContain("Not enough data for chart");
  });

  it("applies accessible aria-label to SVG", () => {
    render(
      <ResponseChart
        heartbeats={mockHeartbeats}
        maxPing={mockMaxPing}
        aria-label="Response time chart"
      />,
    );
    const chartSvg = screen.getByRole("img", { name: "Response time chart" });
    expect(chartSvg.getAttribute("aria-label")).toBe("Response time chart");
  });

  it("renders chart with maxPing value", () => {
    render(<ResponseChart heartbeats={mockHeartbeats} maxPing={mockMaxPing} />);
    // chartMax = max(100 * 1.1, 100) = 110
    const maxValue = screen.getByText("110");
    expect(maxValue).toBeDefined();
  });

  it("renders minPing value of 0", () => {
    render(<ResponseChart heartbeats={mockHeartbeats} maxPing={mockMaxPing} />);
    const minValue = screen.getByText("0");
    expect(minValue).toBeDefined();
  });
});
