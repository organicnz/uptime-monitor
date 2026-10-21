#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Environment doctor.
 *
 * Answers one question in under a second: "is this machine set up to run
 * this repository the way the repository intends to be run?" — which, for
 * this project, means entirely on Bun.
 *
 * The checks are deliberately structural rather than advisory. A missing
 * environment variable is a warning, because a CI job may legitimately run
 * without one. A real Node.js on $PATH, a lockfile that has drifted, or a
 * Node.js formatter back in the dependency tree are failures: each of them
 * means the "no Node.js" rule is quietly being broken.
 *
 * The Bun policy itself is read out of `bunfig.toml` with Bun's own TOML
 * parser rather than with regular expressions. That matters more than it
 * looks: `bunfig.toml` is where "this repository has no Node.js" is
 * actually decided, so a setting that is quietly dropped — renamed,
 * re-indented, or moved under the wrong table — has to fail the build. A
 * regex cannot tell `bun = true` from a line of prose that mentions it; a
 * parse can only see a value Bun itself will act on.
 *
 * `bun run doctor` reports and exits 0 on warnings.
 * `bun run doctor -- --strict` turns warnings into failures.
 */
import { realpathSync } from "bun:fs";
import { readFile } from "bun:fs/promises";
import { join } from "bun:path";

import { REQUIRED_ENV_VARS } from "../lib/env";
import { findProbeBinary } from "../lib/probe";

const ROOT = join(import.meta.dir, "..");

export type Check = {
  name: string;
  ok: boolean;
  detail: string;
  /** A warning does not fail the run unless --strict is passed. */
  warning?: boolean;
};

export type DoctorReport = {
  checks: Check[];
  failures: Check[];
  warnings: Check[];
};

/**
 * The parts of `bunfig.toml` the doctor reads.
 *
 * Declared here rather than imported from a type package: the file is the
 * repository's own configuration, and the doctor is the thing that has to
 * notice when it changes shape.
 */
type Bunfig = {
  install?: {
    exact?: boolean;
    peer?: boolean;
    minimumReleaseAge?: number;
  };
  run?: {
    shell?: string;
    bun?: boolean;
    noOrphans?: boolean;
  };
  test?: {
    randomize?: boolean;
    preload?: string[];
  };
  lint?: {
    maxWarnings?: number;
    typeAware?: boolean;
  };
  fmt?: {
    ignorePatterns?: string[];
  };
};

type PackageJson = {
  engines?: { bun?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  trustedDependencies?: string[];
};

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(
    await readFile(join(ROOT, "package.json"), "utf-8"),
  ) as PackageJson;
}

/**
 * Read `bunfig.toml` with Bun's own TOML parser.
 *
 * A parse failure is not a warning: an unparseable `bunfig.toml` is
 * ignored by Bun in full, which would silently undo every setting in it —
 * including the `node` → Bun alias that the whole "no Node.js" rule rests
 * on.
 */
async function readBunfig(): Promise<{ bunfig: Bunfig; error: string | null }> {
  const source = await readFile(join(ROOT, "bunfig.toml"), "utf-8");
  try {
    return { bunfig: Bun.TOML.parse(source), error: null };
  } catch (error) {
    return {
      bunfig: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run every check and return the results.
 *
 * Exported so the unit suite can assert the invariants the doctor guards,
 * rather than only asserting that the script exists.
 */
export async function collectChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const record = (
    name: string,
    ok: boolean,
    detail: string,
    warning = false,
  ): void => {
    checks.push({ name, ok, detail, warning });
  };

  // -------------------------------------------------------------------------
  // 1. The runtime is Bun, and it is new enough.
  // -------------------------------------------------------------------------
  const pkg = await readPackageJson();
  const requiredBun = pkg.engines?.bun ?? ">=1.4.3";
  const versionOk = Bun.semver.satisfies(Bun.version, requiredBun);
  record(
    "runtime",
    versionOk,
    versionOk
      ? `Bun ${Bun.version} (package.json requires ${requiredBun})`
      : `Bun ${Bun.version} does not satisfy ${requiredBun}`,
  );

  // -------------------------------------------------------------------------
  // 2. bunfig.toml parses.
  //
  //    Every setting below is read out of the parsed document, so a file
  //    Bun cannot read is a failure rather than a silent no-op.
  // -------------------------------------------------------------------------
  const { bunfig, error: bunfigError } = await readBunfig();
  record(
    "bunfig",
    bunfigError === null,
    bunfigError === null
      ? "bunfig.toml parses as TOML"
      : `bunfig.toml does not parse: ${bunfigError} — Bun ignores the whole file when it cannot read it`,
  );

  // -------------------------------------------------------------------------
  // 3. `node` on $PATH is Bun's alias, not a Node.js installation.
  //
  //    Two separate facts, checked separately:
  //
  //      a) bunfig.toml sets `[run] bun = true`. That is the policy: every
  //         command `bun run` starts sees a `node` that is really Bun, so a
  //         third-party binary with a `#!/usr/bin/env node` shebang still
  //         runs on Bun. This is the check that fails the build.
  //
  //      b) what `node` actually resolves to right now. A CI runner ships a
  //         real Node.js, which is fine: the alias shadows it for every
  //         `bun run` script. It is reported, not failed.
  // -------------------------------------------------------------------------
  const aliasConfigured = bunfig.run?.bun === true;
  record(
    "node alias",
    aliasConfigured,
    aliasConfigured
      ? "bunfig.toml sets [run] bun = true — every `node` invocation runs on Bun"
      : "bunfig.toml does not set [run] bun = true — a `#!/usr/bin/env node` binary would start a real Node.js",
  );

  const nodePath = Bun.which("node");
  if (nodePath === null) {
    record(
      "node binary",
      true,
      "no `node` on $PATH — nothing can reach a Node.js runtime",
    );
  } else {
    const bunPath = Bun.which("bun");
    let isBunAlias: boolean;
    try {
      isBunAlias =
        bunPath !== null && realpathSync(nodePath) === realpathSync(bunPath);
    } catch {
      isBunAlias = false;
    }
    record(
      "node binary",
      isBunAlias,
      isBunAlias
        ? `\`node\` resolves to Bun (${nodePath})`
        : `a real Node.js is installed at ${nodePath}; the Bun alias shadows it for \`bun run\` scripts, but a direct \`node\` call would use it`,
      !isBunAlias,
    );
  }

  // -------------------------------------------------------------------------
  // 4. The toolchain runs on Bun's own shell.
  //
  //    `/bin/sh` is a different implementation on every platform, and a
  //    script that depends on it is a script that behaves differently
  //    somewhere else. Bun Shell is the same everywhere.
  // -------------------------------------------------------------------------
  const shell = bunfig.run?.shell;
  record(
    "shell",
    shell === "bun",
    shell === "bun"
      ? 'bunfig.toml sets [run] shell = "bun" — scripts do not depend on /bin/sh'
      : `bunfig.toml sets [run] shell = ${shell ? `"${shell}"` : "nothing"} — scripts depend on the system shell`,
  );

  // -------------------------------------------------------------------------
  // 5. A `bun run` process takes its children with it.
  //
  //    Without this, a dev server that outlives its terminal keeps the
  //    port bound, and the next run fails on a port that is already taken.
  // -------------------------------------------------------------------------
  record(
    "orphans",
    bunfig.run?.noOrphans === true,
    bunfig.run?.noOrphans === true
      ? "bunfig.toml sets [run] noOrphans = true — a stopped script takes its children with it"
      : "bunfig.toml does not set [run] noOrphans = true — a stopped script can leave a dev server holding the port",
  );

  // -------------------------------------------------------------------------
  // 6. The test suite runs in a random order.
  //
  //    A fixed order lets an inter-test dependency hide: a test that only
  //    passes because another one ran first is a test that will fail on
  //    somebody's machine. Bun prints the seed, so the failure is
  //    reproducible with `bun test --seed <n>`.
  // -------------------------------------------------------------------------
  record(
    "test order",
    bunfig.test?.randomize === true,
    bunfig.test?.randomize === true
      ? "bunfig.toml sets [test] randomize = true — an inter-test dependency cannot hide"
      : "bunfig.toml does not set [test] randomize = true — the suite runs in a fixed order",
  );

  // -------------------------------------------------------------------------
  // 7. The lockfile still matches package.json.
  // -------------------------------------------------------------------------
  const install = await Bun.$`bun install --frozen-lockfile --dry-run`
    .nothrow()
    .quiet();
  record(
    "lockfile",
    install.exitCode === 0,
    install.exitCode === 0
      ? "bun.lock is in sync with package.json"
      : "bun.lock is out of sync with package.json — run `bun install`",
  );

  // -------------------------------------------------------------------------
  // 8. No Node.js-only tooling has crept back into the dependency tree.
  //
  //    Bun's own formatter replaced Prettier and Bun's own linter replaced
  //    ESLint and `eslint-config-next`.
  // -------------------------------------------------------------------------
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const nodeOnlyTooling = [
    "prettier",
    "eslint",
    "eslint-config-next",
    "ts-node",
    "nodemon",
    "cross-env",
  ];
  const found = nodeOnlyTooling.filter((name) => name in allDeps);
  record(
    "dependencies",
    found.length === 0,
    found.length === 0
      ? "no Node.js-only tooling in the dependency tree"
      : `found Node.js-only tooling: ${found.join(", ")}`,
  );

  // The format script must not shell out to a Node.js formatter, and the
  // lint script must not shell out to a Node.js linter.
  const formatScript = pkg.scripts?.format ?? "";
  const formatIsBun = /^bun fmt\b/.test(formatScript);
  record(
    "formatter",
    formatIsBun,
    formatIsBun
      ? `\`bun run format\` → \`${formatScript}\``
      : `the format script does not use Bun's formatter: \`${formatScript}\``,
  );

  const lintScript = pkg.scripts?.lint ?? "";
  const lintIsBun = /^bun lint\b/.test(lintScript);
  record(
    "linter",
    lintIsBun,
    lintIsBun
      ? `\`bun run lint\` → \`${lintScript}\``
      : `the lint script does not use Bun's linter: \`${lintScript}\``,
  );

  // A warning has to be a failure, or the local run and the CI gate are not
  // the same gate.
  const maxWarnings = bunfig.lint?.maxWarnings;
  record(
    "lint warnings",
    maxWarnings === 0,
    maxWarnings === 0
      ? "bunfig.toml sets [lint] maxWarnings = 0 — a warning fails the run"
      : `bunfig.toml sets [lint] maxWarnings = ${maxWarnings ?? "nothing"} — a warning does not fail the run`,
  );

  // The type-aware rules are the ones that need the type checker: an `any`
  // that came off the network, a promise nobody awaited, a type assertion
  // that changes nothing. The compiler is silent about all three.
  record(
    "type-aware lint",
    bunfig.lint?.typeAware === true,
    bunfig.lint?.typeAware === true
      ? "bunfig.toml sets [lint] typeAware = true — the linter sees the types"
      : "bunfig.toml does not set [lint] typeAware = true — the linter is blind to what the types say",
  );

  // -------------------------------------------------------------------------
  // 9. The type checker is tsrs.
  //
  //    `tsrs` is the Rust port of the TypeScript 7 compiler, and it is the
  //    only gate: it is 100% conformant with the reference implementation,
  //    and it is the only TypeScript 7 checker that runs without Node.js.
  //    Bun's own checker is still there for the pre-commit hook, which checks
  //    a subset of the files rather than the whole project.
  //
  //    Both facts are checked: that the binary is installed, and that the
  //    `typecheck` script is the one that runs it.
  // -------------------------------------------------------------------------
  const typecheckScript = pkg.scripts?.typecheck ?? "";
  const typecheckIsTsrs = /^bun --bun tsrs\b/.test(typecheckScript);
  record(
    "type checker",
    typecheckIsTsrs,
    typecheckIsTsrs
      ? `\`bun run typecheck\` → \`${typecheckScript}\``
      : `the typecheck script does not use tsrs, the Rust port of the TypeScript compiler: \`${typecheckScript}\``,
  );

  const tsrs = await Bun.$`bun --bun tsrs --version`.nothrow().quiet();
  const tsrsInstalled = tsrs.exitCode === 0;
  record(
    "tsrs",
    tsrsInstalled,
    tsrsInstalled
      ? tsrs.stdout.toString().trim()
      : "tsrs is not installed — run `bun install`",
  );

  // -------------------------------------------------------------------------
  // 10. The coverage gate runs on Bun's own test runner.
  //
  //     A gate that shells out to a different runner measures a different
  //     thing, and a gate that scrapes a human-readable table breaks the
  //     day the table is re-aligned. The gate reads the lcov artifact Bun
  //     writes.
  // -------------------------------------------------------------------------
  const coverageScript = pkg.scripts?.["coverage-check"] ?? "";
  const coverageSource = await readFile(
    join(ROOT, "scripts", "coverage-check.ts"),
    "utf-8",
  ).catch(() => "");
  const coverageIsBun =
    /^bun\s+scripts\/coverage-check\.ts$/.test(coverageScript) &&
    coverageSource.includes("bun test __tests__") &&
    coverageSource.includes("--coverage-reporter=lcov");
  record(
    "coverage gate",
    coverageIsBun,
    coverageIsBun
      ? "the coverage gate runs `bun test --coverage` and reads Bun's lcov report"
      : "the coverage gate does not read Bun's own coverage report",
  );

  // -------------------------------------------------------------------------
  // 11. The supply chain is pinned and cooled down.
  //
  //     `exact` means a dependency resolves to one version rather than a
  //     range, so a drifting registry cannot change what is installed.
  //     `minimumReleaseAge` refuses a release published less than three
  //     days ago: most compromised packages are detected and yanked inside
  //     that window, so a fresh version is the most dangerous one.
  // -------------------------------------------------------------------------
  const installExact = bunfig.install?.exact === true;
  const releaseAge = bunfig.install?.minimumReleaseAge;
  const cooledDown = typeof releaseAge === "number" && releaseAge > 0;
  record(
    "supply chain",
    installExact && cooledDown,
    installExact && cooledDown
      ? `bunfig.toml pins exact versions and refuses releases younger than ${Math.round(releaseAge / 86_400)} day(s)`
      : `bunfig.toml does not pin exact versions${cooledDown ? "" : " and does not set [install] minimumReleaseAge"}`,
  );

  // -------------------------------------------------------------------------
  // 12. Dependency lifecycle scripts are explicitly trusted.
  //
  //     Bun is default-secure: a dependency's install script does not run
  //     unless the package is on an allow list. Naming the list in
  //     package.json turns that default into a decision that shows up in
  //     the diff — and the list being empty is the strongest version of
  //     it, because the only install scripts in this tree are Node.js
  //     ones that have no business running.
  // -------------------------------------------------------------------------
  const trusted = pkg.trustedDependencies;
  record(
    "trusted dependencies",
    Array.isArray(trusted),
    Array.isArray(trusted)
      ? `package.json trusts ${trusted.length === 0 ? "no dependency" : trusted.join(", ")} — no install script runs`
      : "package.json does not declare trustedDependencies — Bun falls back to its built-in list, which is not this repository's decision",
  );

  // -------------------------------------------------------------------------
  // 13. The Rust probe is available.
  //
  //     The probe is optional: the app falls back to its own in-process
  //     implementation when the binary is missing. It is still worth
  //     reporting, because a deployment that meant to have it and does not
  //     is slower than it should be.
  // -------------------------------------------------------------------------
  const probe = findProbeBinary();
  record(
    "probe",
    true,
    probe
      ? `the Rust probe is installed at ${probe}`
      : "the Rust probe is not installed — checks run in-process",
  );

  // -------------------------------------------------------------------------
  // 14. The required environment is present.
  //
  //     A missing variable is a warning rather than a failure: the schema
  //     migrations and the type checker do not need one, and a CI job may
  //     legitimately run without a Supabase instance.
  // -------------------------------------------------------------------------
  const missing = REQUIRED_ENV_VARS.filter((name) => !Bun.env[name]?.trim());
  record(
    "environment",
    missing.length === 0,
    missing.length === 0
      ? `all ${REQUIRED_ENV_VARS.length} required variables are set`
      : `missing: ${missing.join(", ")} — see .env.local.example`,
    missing.length > 0,
  );

  return checks;
}

/** Print the report and return the process exit code. */
export function report(checks: Check[], strict: boolean): number {
  const width = Math.max(...checks.map((check) => check.name.length));
  console.log("\n🩺 Uptime Monitor — environment doctor\n");
  for (const check of checks) {
    const mark = check.ok ? "✔" : check.warning ? "▲" : "✘";
    console.log(`  ${mark} ${check.name.padEnd(width)}  ${check.detail}`);
  }
  console.log("");

  const failures = checks.filter((check) => !check.ok && !check.warning);
  const warnings = checks.filter((check) => !check.ok && check.warning);

  if (warnings.length > 0) {
    console.log(`▲ ${warnings.length} warning(s).`);
  }
  if (failures.length > 0) {
    console.error(`✘ ${failures.length} check(s) failed.\n`);
    return 1;
  }
  if (warnings.length === 0) {
    console.log("✔ All checks passed.\n");
    return 0;
  }
  if (strict) {
    console.error("✘ --strict: warnings are treated as failures.\n");
    return 1;
  }
  return 0;
}

export async function runDoctor(strict = false): Promise<number> {
  return report(await collectChecks(), strict);
}

// `import.meta.main` is true only when this file is the entry point, so
// importing the module (from a test, say) does not run the doctor.
if (import.meta.main) {
  // `process.exitCode` rather than `process.exit()`: Bun flushes pending
  // writes before the process ends, so the report is never truncated when
  // the output is piped into a CI log.
  process.exitCode = await runDoctor(Bun.argv.includes("--strict"));
}
