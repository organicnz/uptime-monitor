import { cleanup, render, screen } from "@testing-library/react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

afterEach(() => {
  cleanup();
});

describe("Card", () => {
  it("renders children with the card slot", () => {
    render(<Card>body text</Card>);
    const root = screen.getByText("body text");
    expect(root.closest('[data-slot="card"]')).toBeDefined();
  });

  it("merges a custom className", () => {
    render(<Card className="custom-card">body text</Card>);
    const root = screen.getByText("body text");
    expect(root.className).toContain("custom-card");
  });

  it("renders CardHeader with the header slot", () => {
    render(
      <Card>
        <CardHeader>header text</CardHeader>
      </Card>,
    );
    const header = screen.getByText("header text");
    expect(header.closest('[data-slot="card-header"]')).toBeDefined();
  });

  it("renders CardTitle with semibold styling", () => {
    render(
      <Card>
        <CardTitle>Monitor status</CardTitle>
      </Card>,
    );
    const title = screen.getByText("Monitor status");
    expect(title.closest('[data-slot="card-title"]')).toBeDefined();
    expect(title.className).toContain("font-semibold");
  });

  it("renders CardDescription with muted styling", () => {
    render(
      <Card>
        <CardDescription>Last checked 1 minute ago</CardDescription>
      </Card>,
    );
    const description = screen.getByText("Last checked 1 minute ago");
    expect(description.closest('[data-slot="card-description"]')).toBeDefined();
    expect(description.className).toContain("text-muted-foreground");
  });

  it("renders CardAction with the action slot", () => {
    render(
      <Card>
        <CardAction>action node</CardAction>
      </Card>,
    );
    const action = screen.getByText("action node");
    expect(action.closest('[data-slot="card-action"]')).toBeDefined();
  });

  it("renders CardContent with the content slot", () => {
    render(
      <Card>
        <CardContent>content node</CardContent>
      </Card>,
    );
    const content = screen.getByText("content node");
    expect(content.closest('[data-slot="card-content"]')).toBeDefined();
  });

  it("renders CardFooter with the footer slot", () => {
    render(
      <Card>
        <CardFooter>footer node</CardFooter>
      </Card>,
    );
    const footer = screen.getByText("footer node");
    expect(footer.closest('[data-slot="card-footer"]')).toBeDefined();
  });
});
