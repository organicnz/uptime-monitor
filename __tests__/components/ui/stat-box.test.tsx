import { cleanup, render, screen } from "@testing-library/react";
import { StatBox } from "@/components/ui/stat-box";

afterEach(() => {
  cleanup();
});

describe("StatBox", () => {
  it("renders with label and value", () => {
    render(<StatBox label="Response" value="42 ms" highlight />);
    const group = screen.getByRole("group", { name: "Response: 42 ms" });
    expect(group).toBeDefined();
    expect(group.textContent).toContain("42 ms");
  });

  it("renders with sublabel", () => {
    render(<StatBox label="Response" sublabel="(Current)" value="42 ms" />);
    const sublabelElement = screen.getByText("(Current)");
    expect(sublabelElement).toBeDefined();
  });

  it("renders with muted class", () => {
    render(<StatBox label="Response" value="999 ms" muted />);
    const group = screen.getByRole("group", { name: "Response: 999 ms" });
    expect(group.textContent).toContain("999 ms");
    expect(group.innerHTML).toContain("text-neutral-600");
  });

  it("renders with highlight class", () => {
    render(<StatBox label="Response" value="42 ms" highlight />);
    const group = screen.getByRole("group", { name: "Response: 42 ms" });
    expect(group.innerHTML).toContain("text-green-400");
    expect(group.innerHTML).toContain("underline");
  });

  it("renders without highlight or muted", () => {
    render(<StatBox label="Response" value="50 ms" />);
    const group = screen.getByRole("group", { name: "Response: 50 ms" });
    expect(group.innerHTML).toContain("text-base");
    expect(group.innerHTML).toContain("sm:text-lg");
    expect(group.innerHTML).toContain("font-semibold");
  });
});
