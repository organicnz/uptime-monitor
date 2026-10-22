/**
 * The `eslint-disable` comments, and what they turn off.
 *
 * The repository is on Bun's linter, and Bun's linter honours the
 * `eslint-disable` comments that ESLint left behind — the ones that are
 * still doing a job are still doing it. This reads the same comments, so
 * a comment that silences a type-aware rule silences it here too.
 *
 * Two forms are understood, because they are the two the repository uses:
 *
 * A block comment that names rules turns them off for the rest of the
 * file, and a line comment that says `eslint-disable-next-line` turns them
 * off for the next line. A comment with no rule names turns every rule
 * off.
 */

/** What a file's comments turn off. */
export type Disables = {
  /** The rules that are off for the whole file. */
  file: Set<string>;
  /** The rules that are off for a line, by line number. */
  lines: Map<number, Set<string>>;
};

/** The rules a comment names, or `undefined` when it names them all. */
function rulesIn(comment: string): Set<string> | undefined {
  const body = comment.replace(/^\/\*+/, "").replace(/\*+\/$/, "");
  const body2 = body.replace(/^\/\/+/, "").trim();
  const withoutDirective = body2
    .replace(/^eslint-disable-next-line\b/, "")
    .replace(/^eslint-disable\b/, "")
    .trim();
  if (!withoutDirective) return undefined;

  const rules = new Set<string>();
  for (const name of withoutDirective.split(",")) {
    const rule = name.trim();
    if (rule) rules.add(rule);
  }
  return rules.size === 0 ? undefined : rules;
}

/**
 * Read the comments of a file.
 *
 * The text is scanned rather than the AST, because the comments are not
 * in the AST — they are trivia, and the trivia is what a disable comment
 * is.
 */
export function readDisables(text: string): Disables {
  const file = new Set<string>();
  const lines = new Map<number, Set<string>>();

  const linesOfText = text.split("\n");

  for (const [index, line] of linesOfText.entries()) {
    const block = line.match(
      /\/\*\s*eslint-disable\b([^*]*(?:\*(?!\/)[^*]*)*)\*\//,
    );
    if (block) {
      const rules = rulesIn(`/*${block[1]}*/`);
      if (rules) for (const rule of rules) file.add(rule);
      continue;
    }

    const next = line.match(/\/\/\s*eslint-disable-next-line\b(.*)$/);
    if (!next) continue;

    const rules = rulesIn(`//${next[1]}`);
    const target = index + 2;
    const existing = lines.get(target) ?? new Set<string>();
    if (rules) for (const rule of rules) existing.add(rule);
    else existing.add("*");
    lines.set(target, existing);
  }

  return { file, lines };
}

/**
 * Is a finding turned off by a comment?
 *
 * A comment with no rule names turns every rule off, which is what the
 * `*` in the set means.
 */
export function isDisabled(
  disables: Disables,
  rule: string,
  line: number,
): boolean {
  if (disables.file.has(rule) || disables.file.has("*")) return true;

  const forLine = disables.lines.get(line);
  if (!forLine) return false;
  return forLine.has(rule) || forLine.has("*");
}
