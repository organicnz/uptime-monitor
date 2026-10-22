import { join } from "bun:path";

import type { Rule } from "./types";

/**
 * The linter's own overrides, read from `bunfig.toml`.
 *
 * The repository turns some rules off for some files, and the reasons are
 * in the configuration. A mock has to keep the async signature of the
 * thing it replaces, so `require-await` cannot apply to the test tree; a
 * server action has to be async, so it cannot apply to `lib/actions/`;
 * and the Edge Functions run on Deno, where the `no-unsafe-*` rules would
 * be describing a type the repository cannot supply.
 *
 * The rules this lint replaces read the same configuration, so this reads
 * it too. A rule that is off in the configuration is off here, and the
 * difference between the two implementations is not a difference in what
 * they find.
 */

/** One override: the files it covers, and the rules it turns off. */
type Override = {
  /** The file patterns, relative to the project root. */
  patterns: Bun.Glob[];
  /** The rules that are off. */
  rules: Set<string>;
};

type Bunfig = {
  lint?: {
    overrides?: { files?: string[]; rules?: Record<string, string> }[];
  };
};

/**
 * The overrides, read from the project's `bunfig.toml`.
 *
 * A configuration that cannot be read is a configuration that cannot be
 * honoured, so a failure to parse it is a failure here rather than a
 * silently different set of rules.
 */
export async function readOverrides(cwd: string): Promise<Override[]> {
  const bunfig = Bun.TOML.parse(
    await Bun.file(join(cwd, "bunfig.toml")).text(),
  ) as Bunfig;

  const overrides: Override[] = [];
  for (const override of bunfig.lint?.overrides ?? []) {
    const rules = new Set(
      Object.entries(override.rules ?? {})
        .filter(([, setting]) => setting === "off")
        .map(([rule]) => rule),
    );
    if (rules.size === 0) continue;

    overrides.push({
      patterns: (override.files ?? []).map((pattern) => new Bun.Glob(pattern)),
      rules,
    });
  }

  return overrides;
}

/**
 * The rules that are off for a file.
 *
 * The patterns are matched against the path relative to the project root,
 * with the separators the configuration uses.
 */
export function disabledRules(
  overrides: readonly Override[],
  file: string,
  cwd: string,
): Set<string> {
  const relative = file.startsWith(cwd) ? file.slice(cwd.length + 1) : file;
  const disabled = new Set<string>();

  for (const override of overrides) {
    const covered = override.patterns.some((pattern) =>
      pattern.match(relative),
    );
    if (!covered) continue;
    for (const rule of override.rules) disabled.add(rule);
  }

  return disabled;
}

/** The rules that are on for a file. */
export function enabledRules(
  rules: readonly Rule[],
  disabled: ReadonlySet<string>,
): Rule[] {
  return rules.filter((rule) => !disabled.has(rule.name));
}
