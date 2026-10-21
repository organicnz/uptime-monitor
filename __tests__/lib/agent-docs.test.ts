import { readFile } from "bun:fs/promises";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import {
  expectedClaudeMd,
  stripManagedBlocks,
} from "@/scripts/sync-agent-docs";

const ROOT = join(import.meta.dir, "..", "..");

/**
 * The two agent documents.
 *
 * `AGENTS.md` is the one Next.js writes to: it manages its own blocks inside
 * that file, and rewrites them on every `next dev` and `next build`.
 * `CLAUDE.md` is the same document under the other name, minus those blocks.
 *
 * The copy is generated rather than maintained by hand, because the framework
 * rewrites its blocks on every run: a hand-maintained pair drifts the first
 * time `next dev` touches the file.
 */
describe("the agent documents", () => {
  it("keeps CLAUDE.md in sync with AGENTS.md", async () => {
    const claude = await readFile(join(ROOT, "CLAUDE.md"), "utf-8");

    expect(await expectedClaudeMd()).toBe(claude);
  });

  it("strips a managed block and the blank line that separated it", () => {
    const source = [
      "# Title",
      "",
      "<!-- BEGIN:nextjs-agent-rules -->",
      "managed",
      "<!-- END:nextjs-agent-rules -->",
      "",
      "Body.",
      "",
    ].join("\n");

    expect(stripManagedBlocks(source)).toBe("# Title\n\nBody.\n");
  });

  it("strips every managed block the framework may write", () => {
    const source = [
      "# Title",
      "",
      "<!-- BEGIN:nextjs-agent-rules -->",
      "rules",
      "<!-- END:nextjs-agent-rules -->",
      "",
      "<!-- BEGIN:nextjs-agent-upgrade -->",
      "upgrade",
      "<!-- END:nextjs-agent-upgrade -->",
      "",
      "Body.",
      "",
    ].join("\n");

    expect(stripManagedBlocks(source)).toBe("# Title\n\nBody.\n");
  });

  it("does not swallow the document when a block is never closed", () => {
    const source = "# Title\n\n<!-- BEGIN:nextjs-agent-rules -->\nmanaged\n";

    expect(stripManagedBlocks(source)).toBe("# Title\n");
  });
});
