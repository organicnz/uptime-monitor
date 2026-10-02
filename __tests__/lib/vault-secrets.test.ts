import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { ALL_SENSITIVE_CONFIG_KEYS } from "@/lib/notification-types";
import { DOCUMENTED_ENV_VARS } from "@/lib/env";

const ROOT = join(import.meta.dir, "..", "..");
const MIGRATION = join(
  ROOT,
  "supabase",
  "migrations",
  "20260927094500_add_vault_notification_secrets.sql",
);
const EXAMPLE_ENV = join(ROOT, ".env.local.example");
const SCHEMA = join(ROOT, "supabase", "schema.sql");

const migration = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf-8") : "";

describe("vault migration", () => {
  it("exists and enables the vault extension", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(migration).toContain(
      "CREATE EXTENSION IF NOT EXISTS supabase_vault",
    );
  });

  it("blocks every sensitive key at the database level", () => {
    // The CHECK constraint and the backfill must agree with
    // SENSITIVE_CONFIG_KEYS, or a credential could slip back into `config`.
    for (const key of ALL_SENSITIVE_CONFIG_KEYS) {
      expect(migration).toContain(`'${key}'`);
    }
    expect(migration).toContain("notification_channels_config_has_no_secrets");
  });

  it("takes direct vault access away from anon and authenticated", () => {
    expect(migration).toContain(
      "REVOKE ALL ON vault.secrets FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON vault.decrypted_secrets FROM PUBLIC, anon, authenticated",
    );
  });

  it("takes away CREATE on the public schema from every role", () => {
    expect(migration).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
  });

  it("reaches the vault only through owner-checked functions", () => {
    for (const fn of [
      "notification_channel_secret_id",
      "notification_channel_secret",
      "notification_channel_secrets",
      "notification_channel_set_secret",
      "notification_channel_clear_secret",
    ]) {
      expect(migration).toContain(`FUNCTION public.${fn}`);
    }

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("auth.role()");
    // Every accessor must be revoked from PUBLIC before it is granted to
    // specific roles, otherwise the grant is a no-op and the RPC is
    // unreachable rather than merely restricted.
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.notification_channel_secret_id(UUID) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.notification_channel_secret(UUID) TO authenticated, service_role",
    );
  });

  it("never leaves the owner gate itself callable", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.notification_channel_secret_id(UUID) FROM PUBLIC, anon, authenticated",
    );
    expect(migration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.notification_channel_secret_id(UUID)",
    );
  });

  it("stops a client repointing secret_id at another tenant's vault row", () => {
    // The owner gate in notification_channel_secret_id checks the CHANNEL, not
    // the vault row. A client that can write its own channel's secret_id could
    // therefore aim it at a foreign vault row and read that row back. The
    // guard trigger is what closes that, so it is not optional.
    expect(migration).toContain("notification_channels_guard_secret_id()");
    expect(migration).toContain(
      "BEFORE INSERT OR UPDATE OF secret_id ON notification_channels",
    );
    expect(migration).toContain("app.notification_secret_write");
  });

  it("flags only the trusted writers, and revokes the flag helper", () => {
    const setFlags = (
      migration.match(/set_config\('app\.notification_secret_write'/g) ?? []
    ).length;
    // notification_channel_set_secret, notification_channel_clear_secret, and
    // the backfill block. Nothing else may set it.
    expect(setFlags).toBe(3);
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.notification_channels_guard_secret_id() FROM PUBLIC, anon, authenticated",
    );
  });

  it("deletes the vault secret when the channel is deleted", () => {
    expect(migration).toContain("delete_notification_channel_secret");
    expect(migration).toContain("BEFORE DELETE ON notification_channels");
    expect(migration).toContain("DELETE FROM vault.secrets");
  });

  it("avoids operators that need a newer PostgreSQL than Supabase may run", () => {
    // `jsonb - text[]` is PostgreSQL 16+. The backfill must not depend on it.
    expect(migration).not.toMatch(/-\s*ARRAY\[/);
    expect(migration).toContain("jsonb_object_agg");
  });

  it("uses a re-runnable trigger definition", () => {
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS delete_notification_channel_secret",
    );
  });
});

describe("schema.sql and the vault migration agree", () => {
  it("declares the same column in the reference schema", () => {
    // schema.sql is the human reference; the migration is what runs. If the
    // column is missing from one of them, a fresh `db reset` diverges.
    expect(readFileSync(SCHEMA, "utf-8")).toContain("secret_id UUID");
  });
});

describe("env documentation", () => {
  const example = readFileSync(EXAMPLE_ENV, "utf-8");

  it("documents every variable lib/env.ts knows about", () => {
    for (const name of DOCUMENTED_ENV_VARS) {
      expect(example).toContain(name);
    }
  });

  it("marks the project ref as a variable, not a secret", () => {
    // SUPABASE_PROJECT_REF is the subdomain of https://<ref>.supabase.co and
    // is already public via NEXT_PUBLIC_SUPABASE_URL.
    expect(example).toContain(
      "SUPABASE_PROJECT_REF  -> GitHub Actions VARIABLE",
    );
    const workflow = readFileSync(
      join(ROOT, ".github", "workflows", "supabase-migrations.yml"),
      "utf-8",
    );
    expect(workflow).toContain("vars.SUPABASE_PROJECT_REF");
    expect(workflow).not.toContain("secrets.SUPABASE_PROJECT_REF");
  });

  it("documents no value that looks like a credential", () => {
    const assignments = example
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => /^[A-Z0-9_]+=/.test(line.trim()));

    // Every documented value must be an obvious placeholder. The point is to
    // catch someone pasting a real value in, so allow anything that is
    // visibly a template.
    const placeholder =
      /^(https?:\/\/\S+|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.\.\.|user-uuid-\d+(,user-uuid-\d+)*|generate_a_secure_random_string_here|your-[\w-]+)$/;

    for (const line of assignments) {
      const value = line.slice(line.indexOf("=") + 1).trim();
      if (value === "") continue;
      expect(`${line.split("=")[0]}=>${value}`).toMatch(
        new RegExp(
          `^${line.split("=")[0]}=>${placeholder.source.slice(1, -1)}$`,
        ),
      );
    }
  });
});
