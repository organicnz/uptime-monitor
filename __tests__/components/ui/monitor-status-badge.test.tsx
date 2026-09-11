import { cleanup, render, screen } from "@testing-library/react";
import { MonitorStatusBadge } from "@/components/ui/monitor-status-badge";

afterEach(() => {
  cleanup();
});

describe("MonitorStatusBadge", () => {
  const renderBadge = (status: number) => {
    return render(<MonitorStatusBadge status={status} />);
  };

  it("renders Down status with correct aria-label", () => {
    renderBadge(0);
    const badge = screen.getByRole("status", { name: "Down - Down" });
    expect(badge).toBeDefined();
  });

  it("renders Up status with correct aria-label", () => {
    renderBadge(1);
    const badge = screen.getByRole("status", { name: "Up - Up" });
    expect(badge).toBeDefined();
  });

  it("renders Pending status with correct aria-label", () => {
    renderBadge(2);
    const badge = screen.getByRole("status", { name: "Pending - Pending" });
    expect(badge).toBeDefined();
  });

  it("applies correct color classes for Down status", () => {
    renderBadge(0);
    const badge = screen.getByRole("status", { name: "Down - Down" });
    const badgeClasses = badge.className;
    expect(badgeClasses).toContain("bg-red-500/10");
    expect(badgeClasses).toContain("text-red-500");
    expect(badgeClasses).toContain("border-red-500/30");
  });

  it("applies correct color classes for Up status", () => {
    renderBadge(1);
    const badge = screen.getByRole("status", { name: "Up - Up" });
    const badgeClasses = badge.className;
    expect(badgeClasses).toContain("bg-emerald-500/10");
    expect(badgeClasses).toContain("text-emerald-500");
    expect(badgeClasses).toContain("border-emerald-500/30");
  });

  it("applies correct color classes for Pending status", () => {
    renderBadge(2);
    const badge = screen.getByRole("status", { name: "Pending - Pending" });
    const badgeClasses = badge.className;
    expect(badgeClasses).toContain("bg-amber-500/10");
    expect(badgeClasses).toContain("text-amber-500");
    expect(badgeClasses).toContain("border-amber-500/30");
  });
});
