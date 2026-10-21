#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * CI gate: every migration must be safe to re-apply.
 *
 * CI re-runs all files on every push to `main`, so a bare `CREATE TABLE` or
 * `ADD COLUMN` fails the run instead of reaching the live database and
 * breaking every later run.
 */
import { readFile } from "bun:fs/promises";
import { join } from "bun:path";

import { lintMigrationSql } from "./migration-lint";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "supabase", "migrations");

// `Bun.Glob` is the runtime's own matcher: one traversal, and the paths
// that match come back already filtered.
const MIGRATIONS = new Bun.Glob("*.sql");

const files = [...MIGRATIONS.scanSync(MIGRATIONS_DIR)].sort();

if (files.length === 0) {
  console.error("No migration files found");
  process.exitCode = 1;
} else {
  const violations = (
    await Promise.all(
      files.map(async (file) =>
        lintMigrationSql(
          file,
          await readFile(join(MIGRATIONS_DIR, file), "utf-8"),
        ),
      ),
    )
  ).flat();

  if (violations.length > 0) {
    console.error("Migration idempotency lint FAILED:");
    for (const violation of violations) {
      const where = violation.line
        ? `${violation.file}:${violation.line}`
        : violation.file;
      console.error(`  ${where}: ${violation.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Migration idempotency lint passed (${files.length} files)`);
  }
}
