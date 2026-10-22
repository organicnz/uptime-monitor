import { existsSync, readdirSync, readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import { lintMigrationSql } from "@/scripts/migration-lint";
import { EXPECTED_COLUMNS } from "@/scripts/supabase-expected-schema";

const ROOT = join(import.meta.dir, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const WORKFLOW_PATH = join(
  ROOT,
  ".github",
  "workflows",
  "supabase-migrations.yml",
);
const CONFIG_PATH = join(ROOT, "supabase", "config.toml");
const SCHEMA_PATH = join(ROOT, "supabase", "schema.sql");
const QUALITY_WORKFLOW_PATH = join(
  ROOT,
  ".github",
  "workflows",
  "quality-gate.yml",
);
const SCRIPTS_DIR = join(ROOT, "scripts");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

describe("supabase delivery: migrations", () => {
  it("has migration files in zero-padded, chronological order", () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    expect([...files].sort()).toEqual(files);
    for (const f of files) {
      expect(f).toMatch(/^[0-9a-zA-Z_-]+\.sql$/);
    }
  });

  it("keeps every migration non-empty and idempotent (safe to re-apply)", () => {
    // The same linter the CI gate runs (`bun run migrations:lint`), so a
    // migration that passes here cannot fail there.
    const violations: string[] = [];
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      for (const violation of lintMigrationSql(file, sql)) {
        const where = violation.line ? `${file}:${violation.line}` : file;
        violations.push(`${where}: ${violation.message}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("covers every expected column in schema or migrations", () => {
    const expected = Object.entries(EXPECTED_COLUMNS);
    expect(expected.length).toBeGreaterThan(0);

    const corpus =
      readFileSync(SCHEMA_PATH, "utf-8") +
      migrationFiles()
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))
        .join("\n");

    const missing = expected.flatMap(([table, cols]) =>
      cols
        .filter((col) => !corpus.includes(col))
        .map((col) => `${table}.${col}`),
    );
    expect(missing).toEqual([]);
  });

  it("keeps schema.sql in sync with the groups migration", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS monitor_groups");
    expect(schema).toContain("group_id UUID REFERENCES monitor_groups(id)");
    expect(schema).toContain("idx_monitors_group_id");
  });

  it("keeps the durable cron failure and status-page functions in schema and migrations", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf-8");
    const migration = readFileSync(
      join(
        MIGRATIONS_DIR,
        "20260924161747_add_cron_failures_and_integrity_policies.sql",
      ),
      "utf-8",
    );
    for (const sql of [schema, migration]) {
      expect(sql).toContain("cron_failures");
      expect(sql).toContain("get_public_status_page");
      expect(sql).toContain("create_status_page_with_monitors");
      expect(sql).toContain("update_status_page_with_monitors");
      expect(sql).toContain("notification_channels.user_id");
      expect(sql).toContain("mfa_mutation_allowed");
      expect(sql).toContain("monitors.user_id = status_pages.user_id");
    }
  });
});

describe("delivery gate", () => {
  it("runs the browser suite in the quality workflow", () => {
    const workflow = readFileSync(QUALITY_WORKFLOW_PATH, "utf-8");
    expect(workflow).toContain("name: Quality Gate");
    expect(workflow).toContain("bun run e2e:ci");
    expect(workflow).toContain("bun run e2e:install:ci");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("bun run e2e:seed");
    expect(workflow).toContain(
      `      - uses: supabase/setup-cli@v3
        with:
          version: v2.117.0
      - uses: oven-sh/setup-bun@v2
        with:
          # The latest Bun canary. The canary is a moving target: the npm
          # dist-tag is what tracks it, not a version string in
          # package.json, so \`bun-version: canary\` is the only thing that
          # stays correct as new canaries ship.
          bun-version: canary`,
    );
  });

  it("takes the latest Bun canary in every workflow", () => {
    const workflowDir = join(ROOT, ".github", "workflows");
    const workflowFiles = readdirSync(workflowDir).filter((file) =>
      file.endsWith(".yml"),
    );
    let checked = 0;

    for (const file of workflowFiles) {
      const workflow = readFileSync(join(workflowDir, file), "utf-8");
      if (!workflow.includes("oven-sh/setup-bun@v2")) {
        continue;
      }
      checked += 1;
      // The canary is a moving target, so the version is never pinned
      // twice: the workflows ask for the canary dist-tag, and the runtime
      // and CI can never drift apart.
      expect(workflow).toContain("bun-version: canary");
      expect(workflow).not.toContain("bun-version-file:");
    }

    expect(checked).toBeGreaterThan(0);

    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { packageManager: string; engines: { bun: string } };

    // The pinned runtime is the canary. A canary version carries the date it
    // was built: `1.4.3-canary.20261019.1`.
    expect(pkg.packageManager).toMatch(
      /^bun@\d+\.\d+\.\d+(-canary\.\d{8}\.\d+)?$/,
    );

    // The engine floor is the version the runtime *reports*, not the
    // canary's own number. The `1.4.3-canary.*` build reports itself as
    // `1.4.4`, because it is the canary for that release — so the floor is
    // written against the reported version, and the running Bun has to
    // satisfy it. The doctor makes the same check against package.json.
    expect(pkg.engines.bun).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(Bun.semver.satisfies(Bun.version, pkg.engines.bun)).toBe(true);
  });

  it("keeps the canonical delivery command in Lefthook", () => {
    const lefthook = readFileSync(join(ROOT, "lefthook.yml"), "utf-8");
    expect(lefthook).toContain("run: bun run verify:delivery");
    expect(lefthook).not.toContain("skip_output:");
  });
});

describe("bun-only toolchain", () => {
  it("never provisions a Node.js or Python toolchain in CI", () => {
    const workflowDir = join(ROOT, ".github", "workflows");
    const offenders: string[] = [];

    for (const file of readdirSync(workflowDir).filter((f) =>
      f.endsWith(".yml"),
    )) {
      const workflow = readFileSync(join(workflowDir, file), "utf-8");
      for (const forbidden of [
        "actions/setup-node",
        "actions/setup-python",
        "node-version:",
        "python-version:",
      ]) {
        if (workflow.includes(forbidden)) {
          offenders.push(`${file}: ${forbidden}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("ships the delivery scripts as Bun/TypeScript, with no Python left", () => {
    expect(existsSync(join(SCRIPTS_DIR, "supabase-migrate.ts"))).toBe(true);
    expect(existsSync(join(SCRIPTS_DIR, "supabase-verify-schema.ts"))).toBe(
      true,
    );
    expect(existsSync(join(SCRIPTS_DIR, "lint-migrations.ts"))).toBe(true);

    const python = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith(".py"));
    expect(python).toEqual([]);
  });

  it("runs every package script through the Bun runtime", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { scripts: Record<string, string>; packageManager: string };

    expect(pkg.packageManager.startsWith("bun@")).toBe(true);

    // Every script that shells out to a third-party binary has to say
    // `bun --bun`, otherwise Bun's shell runs it through the binary's
    // `#!/usr/bin/env node` shebang and Node.js comes back.
    const needsBun = [
      "dev",
      "build",
      "start",
      "e2e",
      "e2e:install",
      "e2e:install:ci",
      "verify:gpu",
    ];
    for (const name of needsBun) {
      expect(pkg.scripts[name]).toStartWith("bun --bun ");
    }

    // Bun's own formatter replaced Prettier.
    expect(pkg.scripts.format).toBe("bun fmt");
    expect(pkg.scripts["format:check"]).toBe("bun fmt --check");
    // Bun's own linter replaced ESLint and `eslint-config-next`.
    expect(pkg.scripts.lint).toBe("bun lint");
    expect(pkg.scripts["lint:fix"]).toBe("bun lint --fix");
    // The type checker is `tsrs`, the Rust port of the TypeScript 7
    // compiler, and it is the only gate. The `tsc` that ships with the
    // TypeScript 7 beta is a Node.js program, so it cannot run here at all.
    //
    // `--checkerAssignment go` puts tsrs on the TypeScript 7 reference
    // compiler's own file assignment and checker history. Upstream's own
    // note is that the closest comparison to the Go implementation is
    // `--checkerAssignment go --noLazyMembers`: without the second flag,
    // tsrs canonicalizes some checker history and the diagnostics can
    // differ near an instantiation depth limit. Both cost nothing
    // measurable here.
    expect(pkg.scripts.typecheck).toBe(
      "bun --bun tsrs --noEmit --checkerAssignment go --noLazyMembers",
    );
    expect(pkg.scripts["typecheck:tsc"]).toBeUndefined();
    // There is no second type checker. Bun's own checker used to sit behind
    // `typecheck:fast` for the pre-commit hook, because `tsrs` could not be
    // given a file list; it can now, but only with `--ignoreConfig`, which
    // drops the path aliases and the rest of the project configuration, so a
    // subset check would not be checking the same project. `tsrs` is
    // incremental, so a whole-project run in the hook costs a fraction of a
    // second — and one checker is worth more than a fast second opinion.
    expect(pkg.scripts["typecheck:fast"]).toBeUndefined();

    // The general rule, so a new script cannot opt out by accident: a
    // third-party binary may only ever appear behind `bun --bun`. Strip
    // every such invocation and assert that nothing is left over.
    const thirdPartyBinaries = [
      "next",
      "eslint",
      "tsc",
      "tsrs",
      "playwright",
      "lefthook",
      "prettier",
    ];
    for (const command of Object.values(pkg.scripts)) {
      let remainder = command;
      for (const binary of thirdPartyBinaries) {
        remainder = remainder.replaceAll(`bun --bun ${binary}`, "");
      }
      for (const binary of thirdPartyBinaries) {
        // The command body only, and only in command position: a script
        // *named* `typecheck:watch` is fine, a script that *invokes* tsrs
        // without `bun --bun` is not.
        const inCommandPosition = new RegExp(`(^|[\\s|;&(])${binary}(\\s|$)`);
        expect(remainder).not.toMatch(inCommandPosition);
      }
    }

    // Nothing may reach for npm/npx/node.
    for (const [name, command] of Object.entries(pkg.scripts)) {
      expect(`${name}: ${command}`).not.toMatch(/\b(npm|npx|yarn|pnpm)\b/);
    }
  });
});

describe("supabase delivery: CI/CD workflow", () => {
  const workflow = () => readFileSync(WORKFLOW_PATH, "utf-8");

  it("validates on PRs without touching prod", () => {
    const yml = workflow();
    expect(yml).toContain("validate:");
    expect(yml).toContain("pull_request");
    expect(yml).toContain("workflow_run:");
    expect(yml).toContain("github.event.workflow_run.conclusion == 'success'");
  });

  it("gates privileged jobs to a trusted successful main push", () => {
    const yml = workflow();
    expect(yml).toContain("migrate:");
    expect(yml).toContain("edge-functions:");
    expect(yml).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository",
    );
    expect(yml).toContain("github.event.workflow_run.head_sha == github.sha");
    expect(yml).toContain("github.ref == 'refs/heads/main'");
  });

  it("deploys edge functions non-interactively with --project-ref", () => {
    const yml = workflow();
    expect(yml).toContain(
      'supabase functions deploy --project-ref "$SUPABASE_PROJECT_REF"',
    );
    expect(yml).not.toMatch(/^\s+supabase link\b/m);
    expect(yml).toContain("No supabase/functions sources, skipping deploy.");
  });

  it("fails a main-branch deploy loudly when credentials are missing", () => {
    const yml = workflow();
    expect(yml).toContain(
      "Missing Supabase credentials on a main-branch deploy, failing.",
    );
  });

  it("provisions Bun and the Supabase CLI, and serializes delivery", () => {
    const yml = workflow();
    expect(yml).toContain("oven-sh/setup-bun@v2");
    expect(yml).toContain("bun-version: canary");
    expect(yml).toContain("supabase/setup-cli@v3");
    expect(yml).toContain("version: v2.117.0");
    expect(yml.indexOf("oven-sh/setup-bun@v2")).toBeLessThan(
      yml.indexOf("supabase/setup-cli@v3"),
    );
    expect(yml).toContain("cancel-in-progress: false");
    expect(yml).toContain("needs: [validate, migrate]");
  });

  it("gates both privileged jobs behind the production environment", () => {
    const yml = workflow();
    // An `if:` expression is the only machine-checkable half of the boundary.
    // `environment: production` is the half a human approves, and it is what
    // carries required reviewers and a wait timer.
    const gateCount = (yml.match(/^\s+environment: production$/gm) ?? [])
      .length;
    expect(gateCount).toBe(2);
    expect(yml).toContain("Settings -> Environments -> production");
  });

  it("provisions the edge function secret store from a repository secret", () => {
    const yml = workflow();
    expect(yml).toContain(
      "NOTIFICATION_DISPATCH_SECRET: ${{ secrets.NOTIFICATION_DISPATCH_SECRET }}",
    );
    expect(yml).toContain("supabase secrets set");
    expect(yml).toContain(
      'NOTIFICATION_DISPATCH_SECRET="$NOTIFICATION_DISPATCH_SECRET"',
    );
    // The set must happen before the deploy, or a redeploy could ship a
    // function whose secret is missing.
    expect(yml.indexOf("supabase secrets set")).toBeLessThan(
      yml.indexOf("supabase functions deploy"),
    );
    expect(yml).toContain("NOTIFICATION_DISPATCH_SECRET is not set, failing.");
  });

  it("never passes a secret through a shell command line", () => {
    const yml = workflow();
    // Step-level `env:` only: an interpolated secret in a `run:` string ends
    // up in the process table and in any log that echoes the command.
    for (const name of [
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      "NOTIFICATION_DISPATCH_SECRET",
    ]) {
      const inline = new RegExp(
        `run:[^\\n]*\\$\\{\\{\\s*(secrets|vars)\\.${name}`,
      );
      expect(yml).not.toMatch(inline);
    }
  });

  it("type-checks the edge functions on PRs without any secret", () => {
    const yml = workflow();
    expect(yml).toContain("denoland/setup-deno@v2");
    expect(yml).toContain("deno task check");
    // These steps must be in the `validate` job, which is the only one that
    // runs on pull_request.
    const validateBlock = yml.slice(
      yml.indexOf("  validate:"),
      yml.indexOf("  migrate:"),
    );
    expect(validateBlock).toContain("deno task check");
    expect(validateBlock).not.toContain("secrets.");
  });
});

describe("supabase delivery: CLI config", () => {
  it("checks in supabase/config.toml so no manual init is needed", () => {
    expect(existsSync(CONFIG_PATH)).toBe(true);
    const toml = readFileSync(CONFIG_PATH, "utf-8");
    expect(toml).toContain("project_id");
    expect(toml).not.toContain("[functions.build]");
    expect(toml).not.toContain("[functions.deploy]");
  });

  it("turns off gateway JWT verification only for the dispatch function", () => {
    const toml = readFileSync(CONFIG_PATH, "utf-8");
    // Server-to-server invocations carry a shared secret, not a user JWT, so
    // the gateway check would reject every caller. The handler does its own
    // constant-time compare.
    expect(toml).toContain("[functions.notification-dispatch]");
    expect(toml).toContain("verify_jwt = false");
    const otherFunctions = toml.match(
      /\[functions\.(?!notification-dispatch)/g,
    );
    expect(otherFunctions ?? []).toEqual([]);
  });
});

describe("edge function sources", () => {
  const functionsDir = join(ROOT, "supabase", "functions");

  it("keeps the senders runtime-agnostic", () => {
    const senders = readFileSync(
      join(functionsDir, "_shared", "senders.ts"),
      "utf-8",
    );
    // A `node:*` import would break the edge runtime; `Deno.*` would break
    // `tsc` for the app. Neither may appear in the shared module.
    const code = senders.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/from ["']node:/);
    expect(code).not.toMatch(/\bDeno\.[A-Za-z]/);
    expect(code).not.toMatch(/\bprocess\.env\b/);
  });

  it("fails the dispatch function closed when its own secret is missing", () => {
    const index = readFileSync(
      join(functionsDir, "notification-dispatch", "index.ts"),
      "utf-8",
    );
    expect(index).toContain('Deno.env.get("NOTIFICATION_DISPATCH_SECRET")');
    expect(index).toContain("Dispatch secret is not configured");
    // The credential must come from Vault, not from the function's env.
    expect(index).toContain("notification_channel_secrets");
    expect(index).not.toContain("NOTIFICATION_SERVICE_ROLE");
  });

  it("keeps the Deno-only files out of the app typecheck", () => {
    const tsconfig = readFileSync(join(ROOT, "tsconfig.json"), "utf-8");
    expect(tsconfig).toContain("supabase/functions/notification-dispatch");
    expect(tsconfig).toContain("supabase/functions/_shared/egress.ts");
    // The shared senders must stay IN the app typecheck: the app imports them.
    expect(tsconfig).not.toContain('"supabase/functions/_shared/senders.ts"');
  });
});
