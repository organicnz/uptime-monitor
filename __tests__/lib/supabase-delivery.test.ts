import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const VERIFY_SCRIPT_PATH = join(ROOT, "scripts", "supabase-verify-schema.py");

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
    const violations: string[] = [];
    for (const file of migrationFiles()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
      if (!sql.trim()) {
        violations.push(`${file}: empty file`);
        continue;
      }

      const drops = (sql.match(/DROP\s+POLICY\s+IF\s+EXISTS/gi) ?? []).length;
      const creates = (
        sql.match(/(?<!OR\sREPLACE\s)CREATE\s+POLICY\s+/gi) ?? []
      ).length;
      if (creates > drops) {
        violations.push(
          `${file}: ${creates} CREATE POLICY but only ${drops} DROP POLICY IF EXISTS`,
        );
      }

      sql.split("\n").forEach((line, i) => {
        const s = line.trim().toUpperCase();
        const where = `${file}:${i + 1}`;
        if (/^CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/.test(s)) {
          violations.push(`${where}: bare CREATE TABLE`);
        }
        if (
          /^CREATE\s+(UNIQUE\s+)?INDEX\s+/.test(s) &&
          !/IF\s+NOT\s+EXISTS/.test(s)
        ) {
          violations.push(`${where}: bare CREATE INDEX`);
        }
        if (/(^|\s)ADD\s+COLUMN\s+/.test(s) && !/IF\s+NOT\s+EXISTS/.test(s)) {
          violations.push(`${where}: bare ADD COLUMN`);
        }
      });
    }
    expect(violations).toEqual([]);
  });

  it("covers every verify-script EXPECTED column in schema or migrations", () => {
    const verify = readFileSync(VERIFY_SCRIPT_PATH, "utf-8");
    const expected = [...verify.matchAll(/"(\w+)":\s*\[([^\]]*)\]/g)].map(
      (m) => ({
        table: m[1],
        cols: [...m[2].matchAll(/"(\w+)"/g)].map((c) => c[1]),
      }),
    );
    expect(expected.length).toBeGreaterThan(0);

    const corpus =
      readFileSync(SCHEMA_PATH, "utf-8") +
      migrationFiles()
        .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf-8"))
        .join("\n");

    const missing = expected.flatMap(({ table, cols }) =>
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
          bun-version: "1.4.2"`,
    );
  });

  it("pins the supported Bun version in every dependency-install workflow", () => {
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
      expect(workflow).toContain('bun-version: "1.4.2"');
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("keeps the canonical delivery command in Lefthook", () => {
    const lefthook = readFileSync(join(ROOT, "lefthook.yml"), "utf-8");
    expect(lefthook).toContain("run: bun run verify:delivery");
    expect(lefthook).not.toContain("skip_output:");
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

  it("pins setup-node before setup-cli and serializes delivery", () => {
    const yml = workflow();
    expect(yml).toContain("actions/setup-node@v5");
    expect(yml).toContain("supabase/setup-cli@v3");
    expect(yml).toContain("version: v2.117.0");
    expect(yml.indexOf("actions/setup-node@v5")).toBeLessThan(
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
