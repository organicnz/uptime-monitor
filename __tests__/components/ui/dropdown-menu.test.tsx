import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

afterEach(() => {
  cleanup();
});

function renderOpenMenu() {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>View details</DropdownMenuItem>
        <DropdownMenuItem inset>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("DropdownMenu", () => {
  it("renders the trigger as a button", () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      </DropdownMenu>,
    );
    expect(screen.getByRole("button", { name: "Open menu" })).toBeDefined();
  });

  it("opens the menu when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>View details</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(
      await screen.findByRole("menuitem", { name: "View details" }),
    ).toBeDefined();
  });

  it("renders menu items with the menuitem role", async () => {
    renderOpenMenu();
    expect(
      await screen.findByRole("menuitem", { name: "View details" }),
    ).toBeDefined();
    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeDefined();
  });

  it("applies the inset class when inset is set", async () => {
    renderOpenMenu();
    const item = await screen.findByRole("menuitem", { name: "Duplicate" });
    expect(item.className).toContain("pl-8");
  });

  it("renders a separator", async () => {
    renderOpenMenu();
    expect(await screen.findByRole("separator")).toBeDefined();
  });

  it("merges a custom className on content", async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuContent className="custom-menu">
          <DropdownMenuItem>View details</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("custom-menu");
  });
});
