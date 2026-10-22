import { describe, expect, it } from "bun:test";

import { isDisabled, readDisables } from "@/lib/type-aware-lint/disables";

/**
 * The `eslint-disable` comments.
 *
 * The repository is on Bun's linter, and Bun's linter honours the
 * `eslint-disable` comments that ESLint left behind. The type-aware rules
 * are no longer Bun's, so they read the comments themselves — a comment
 * that silences a rule has to silence it here too, or a developer who
 * reads the comment is being lied to.
 */
describe("the eslint-disable comments", () => {
  it("reads a file-level disable", () => {
    const disables = readDisables(
      "/* eslint-disable @typescript-eslint/no-explicit-any */\nexport const a = 1;\n",
    );

    expect(disables.file.has("@typescript-eslint/no-explicit-any")).toBe(true);
    expect(disables.file.has("@typescript-eslint/no-floating-promises")).toBe(
      false,
    );
  });

  it("reads a disable-next-line", () => {
    const disables = readDisables(
      "// eslint-disable-next-line @typescript-eslint/no-floating-promises\nexport const a = 1;\n",
    );

    expect(
      disables.lines.get(2)?.has("@typescript-eslint/no-floating-promises"),
    ).toBe(true);
    expect(disables.lines.get(3)).toBeUndefined();
  });

  it("reads a disable-next-line with no rule names as every rule", () => {
    const disables = readDisables(
      "// eslint-disable-next-line\nexport const a = 1;\n",
    );

    expect(disables.lines.get(2)?.has("*")).toBe(true);
  });

  it("reads a disable-next-line with several rules", () => {
    const disables = readDisables(
      "// eslint-disable-next-line @typescript-eslint/no-floating-promises, unicorn/no-thenable\nexport const a = 1;\n",
    );

    const rules = disables.lines.get(2);
    expect(rules?.has("@typescript-eslint/no-floating-promises")).toBe(true);
    expect(rules?.has("unicorn/no-thenable")).toBe(true);
  });

  it("says a rule is off only where the comment says so", () => {
    const disables = readDisables(
      "// eslint-disable-next-line @typescript-eslint/no-floating-promises\nexport const a = 1;\n",
    );

    expect(
      isDisabled(disables, "@typescript-eslint/no-floating-promises", 2),
    ).toBe(true);
    expect(
      isDisabled(disables, "@typescript-eslint/no-floating-promises", 3),
    ).toBe(false);
    expect(
      isDisabled(disables, "@typescript-eslint/no-unsafe-assignment", 2),
    ).toBe(false);
  });

  it("says a file-level disable is off everywhere", () => {
    const disables = readDisables(
      "/* eslint-disable @typescript-eslint/no-explicit-any */\nexport const a = 1;\n",
    );

    expect(isDisabled(disables, "@typescript-eslint/no-explicit-any", 99)).toBe(
      true,
    );
  });
});
