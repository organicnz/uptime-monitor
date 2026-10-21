/**
 * Idempotency rules for SQL migrations.
 *
 * CI re-applies every migration file on every push to `main`, so each
 * statement has to be safe to run twice. The rules live here rather than in
 * the CI workflow so the workflow and the unit test can never drift apart:
 * `scripts/lint-migrations.ts` is the CI gate, and
 * `__tests__/lib/supabase-delivery.test.ts` runs the same functions over the
 * same files.
 */

export type MigrationViolation = {
  /** File the violation was found in. */
  file: string;
  /** 1-based line number, when the violation is tied to a single line. */
  line?: number;
  /** Human-readable description of what makes the statement unsafe. */
  message: string;
};

type StatementRule = {
  /** Matches the offending statement. */
  pattern: RegExp;
  /** Message describing why the statement is not re-runnable. */
  message: string;
};

/**
 * Statements that are rejected outright. `IF NOT EXISTS` / `IF EXISTS` forms
 * are the only accepted spelling.
 */
const LINE_RULES: StatementRule[] = [
  {
    pattern: /^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/,
    message: "non-idempotent CREATE TABLE",
  },
  {
    pattern: /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/,
    message: "non-idempotent CREATE INDEX",
  },
  {
    pattern: /^ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/,
    message: "non-idempotent ADD COLUMN",
  },
];

/**
 * `CREATE POLICY` has no `IF NOT EXISTS` form, so the rule is a budget
 * instead: every policy created must be preceded by a matching
 * `DROP POLICY IF EXISTS` in the same file.
 */
const CREATE_POLICY = /(?<!OR\s+REPLACE\s)CREATE\s+POLICY\s+/gi;
const DROP_POLICY_IF_EXISTS = /DROP\s+POLICY\s+IF\s+EXISTS/gi;

/**
 * Lint a single migration file.
 *
 * @param file File name, used only for reporting.
 * @param sql  Full contents of the migration.
 * @returns Every violation found, in file order.
 */
export function lintMigrationSql(
  file: string,
  sql: string,
): MigrationViolation[] {
  const violations: MigrationViolation[] = [];

  if (!sql.trim()) {
    violations.push({ file, message: "empty file" });
    return violations;
  }

  const drops = sql.match(DROP_POLICY_IF_EXISTS)?.length ?? 0;
  const creates = sql.match(CREATE_POLICY)?.length ?? 0;
  if (creates > drops) {
    violations.push({
      file,
      message: `${creates} CREATE POLICY but only ${drops} DROP POLICY IF EXISTS`,
    });
  }

  sql.split("\n").forEach((raw, index) => {
    const line = raw.trim().toUpperCase();
    for (const rule of LINE_RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          file,
          line: index + 1,
          message: rule.message,
        });
      }
    }
  });

  return violations;
}
