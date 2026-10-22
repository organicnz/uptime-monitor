import { existsSync, readdirSync, readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

/**
 * The repository has no Node.js runtime anywhere in its stack.
 *
 * Bun is the package manager, the task runner, the bundler, the test runner,
 * the build tool and the production runtime. Nothing in this repo may pull
 * Node.js back in: not as a runtime, not as a module specifier, not as a
 * type dependency, and not as a package manager in a CI step.
 *
 * These assertions are the enforcement mechanism for that rule. They are
 * cheap to run and they fail loudly the moment a dependency, a script or a
 * stray import reintroduces Node.js.
 */

const ROOT = join(import.meta.dir, "..", "..");

/** Directories that hold first-party source. */
const SOURCE_DIRS = ["app", "components", "hooks", "lib", "scripts", "e2e"];

/** Files at the repository root that are first-party source. */
const ROOT_SOURCE_FILES = [
  "instrumentation.ts",
  "instrumentation-client.ts",
  "next.config.ts",
  "playwright.config.mts",
  "proxy.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
];

/** Source extensions worth scanning. */
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"];

/** Directories that never hold first-party source. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".bundle",
  "test-results",
  "playwright-report",
  "target",
  ".turbo",
]);

/**
 * Every file under `dir`, recursively.
 *
 * `Bun.Glob` is the runtime's own matcher, so the traversal is one pass
 * over the tree rather than a readdir per directory. The ignored
 * directories are filtered out of the result rather than pruned during
 * the walk, because the glob has no exclusion of its own.
 */
const ALL_FILES = new Bun.Glob("**/*");

function* walk(dir: string): Generator<string> {
  for (const relative of ALL_FILES.scanSync({ cwd: dir, onlyFiles: true })) {
    const segments = relative.split("/");
    if (segments.some((segment) => IGNORED_DIRS.has(segment))) continue;
    yield join(dir, relative);
  }
}

/** Every first-party source file in the repository. */
function* sourceFiles(): Generator<string> {
  for (const dir of SOURCE_DIRS) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    yield* walk(full);
  }
  for (const file of ROOT_SOURCE_FILES) {
    const full = join(ROOT, file);
    if (existsSync(full)) yield full;
  }
  // Type declarations, including the ambient Bun module declarations.
  const types = join(ROOT, "types");
  if (existsSync(types)) yield* walk(types);
}

function isSource(path: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/**
 * Strip comments so that a mention of a Node.js API in prose does not read
 * as a use of it.
 *
 * Block comments and whole-line comments only. A trailing `//` comment is
 * left in place, because `//` also occurs inside URL strings and cutting
 * there would mangle the code.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/)/.test(line))
    .join("\n");
}

const files = [...sourceFiles()].filter(isSource);

/**
 * The runtime's own parser, used to find the specifiers a module really
 * imports rather than every quoted string that looks like one.
 */
const transpiler = new Bun.Transpiler({ loader: "tsx" });

describe("bun-only toolchain: no Node.js runtime", () => {
  it("finds the source files it is meant to guard", () => {
    // A silent scan of zero files would pass every assertion below.
    expect(files.length).toBeGreaterThan(50);
  });

  it("never imports a node: module", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      // `from "node:fs"`, `import("node:path")`, `require("node:os")`.
      const matches = source.match(/["'](node:[a-z_/]+)["']/g);
      if (matches) offenders.push(`${file}: ${matches.join(", ")}`);
    }

    expect(offenders).toEqual([]);
  });

  it("never uses the CommonJS or Node.js-only module globals", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (/\b__dirname\b/.test(source)) offenders.push(`${file}: __dirname`);
      if (/\b__filename\b/.test(source)) offenders.push(`${file}: __filename`);
      // `require(` at the start of an expression, not inside a string or a
      // word like `require(` in a comment.
      if (/^\s*(?:const|let|var)?\s*[\w{,\s]*=\s*require\(/m.test(source)) {
        offenders.push(`${file}: require()`);
      }
      if (/^\s*module\.exports\s*=/m.test(source)) {
        offenders.push(`${file}: module.exports`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never imports Node.js built-ins through the bare specifier", () => {
    // `from "fs"` resolves to the Node.js core module, not to a package.
    //
    // `Bun.Transpiler.scan` is the runtime's own parser: it reports the
    // specifiers the module actually imports, static and dynamic, rather
    // than every quoted string that happens to follow the word "from". A
    // regular expression over the source cannot tell an import from a
    // string that reads like one.
    const core = new Set([
      "fs",
      "path",
      "os",
      "crypto",
      "child_process",
      "http",
      "https",
      "net",
      "tls",
      "dns",
      "zlib",
      "stream",
      "util",
      "url",
      "buffer",
      "events",
      "assert",
      "worker_threads",
    ]);
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const entry of transpiler.scan(source).imports) {
        if (core.has(entry.path) || entry.path.startsWith("node:")) {
          offenders.push(`${file}: ${entry.path}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("finds the dynamic imports too", () => {
    // A parser that only reported the static ones would miss
    // `await import("node:fs")`, which resolves just the same.
    const scanned = transpiler.scan(`const p = await import("node:path");`);

    expect(scanned.imports).toContainEqual({
      kind: "dynamic-import",
      path: "node:path",
    });
  });
});

describe("bun-only toolchain: no Node.js type surface", () => {
  it("does not opt into the @types/node globals in tsconfig", () => {
    const tsconfig = readFileSync(join(ROOT, "tsconfig.json"), "utf-8");
    const types = /"types"\s*:\s*\[([^\]]*)\]/.exec(tsconfig)?.[1] ?? "";

    expect(types).not.toContain('"node"');
    // The Bun types must stay: they are the whole type environment.
    expect(types).toContain('"bun-types"');
  });

  it("does not depend on @types/node directly", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as {
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    expect(pkg.devDependencies?.["@types/node"]).toBeUndefined();
    expect(pkg.dependencies?.["@types/node"]).toBeUndefined();
  });

  it("declares the bun: modules against Bun's own API", () => {
    // The ambient declarations used to re-export the @types/node shapes for
    // `node:fs` and friends. They must now describe Bun's API directly.
    const declarations = readFileSync(
      join(ROOT, "types", "bun-modules.d.ts"),
      "utf-8",
    );

    expect(declarations).not.toMatch(/["']node:/);
    expect(declarations).toContain('declare module "bun:fs"');
    expect(declarations).toContain('declare module "bun:path"');
  });
});

describe("bun-only toolchain: no Node.js process API", () => {
  /**
   * `process.env` survives in exactly one shape: Next.js substitutes
   * `process.env.NEXT_PUBLIC_*` into the browser bundle at build time by
   * matching that literal text. Every other file must read the environment
   * through `Bun.env`.
   */
  const PROCESS_ENV_ALLOWLIST = new Set([
    "lib/client-env.ts",
    "lib/env.ts",
    "instrumentation.ts",
    "instrumentation-client.ts",
    "sentry.edge.config.ts",
  ]);

  it("reads the environment through Bun.env outside the build-time allowlist", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.slice(ROOT.length + 1);
      if (PROCESS_ENV_ALLOWLIST.has(relative)) continue;
      const source = codeOnly(readFileSync(file, "utf-8"));
      if (/\bprocess\.env\b/.test(source)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never uses the Node.js-only parts of the process API", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = codeOnly(readFileSync(file, "utf-8"));
      // `process.argv` is `Bun.argv`; `process.exit()` truncates buffered
      // output, so the scripts set `process.exitCode` instead.
      if (/\bprocess\.argv\b/.test(source))
        offenders.push(`${file}: process.argv`);
      if (/\bprocess\.exit\s*\(/.test(source))
        offenders.push(`${file}: process.exit()`);
      if (
        /\bprocess\.(cwd|platform|version|versions|uptime|memoryUsage|execPath|kill)\b/.test(
          source,
        )
      ) {
        offenders.push(`${file}: process.* runtime API`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("never starts a script with a Node.js shebang", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const first = readFileSync(file, "utf-8").split("\n", 1)[0] ?? "";
      if (first.startsWith("#!") && /node/.test(first)) {
        offenders.push(`${file}: ${first}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("bun-only toolchain: Bun is configured as the whole toolchain", () => {
  const bunfig = () => readFileSync(join(ROOT, "bunfig.toml"), "utf-8");

  it("aliases node to bun for every script", () => {
    // Without this, Bun only aliases `node` when node is absent from $PATH.
    // A developer machine or a CI runner that has Node.js installed would
    // then run `#!/usr/bin/env node` binaries on Node.js.
    expect(bunfig()).toMatch(/^\s*bun\s*=\s*true\s*$/m);
  });

  it("runs package.json scripts in Bun's own shell", () => {
    // The toolchain must not depend on /bin/sh being present.
    expect(bunfig()).toMatch(/^\s*shell\s*=\s*"bun"\s*$/m);
  });

  it("randomizes the test order", () => {
    expect(bunfig()).toMatch(/^\s*randomize\s*=\s*true\s*$/m);
  });

  it("keeps the Deno and Playwright suites out of Bun's test discovery", () => {
    // `supabase/functions/_shared/egress_test.ts` matches Bun's `*_test.ts`
    // discovery pattern, but it is Deno code: it imports `jsr:@std/assert@1`,
    // which only Deno can resolve. The e2e specs are Playwright's and need
    // a browser and a running server.
    expect(bunfig()).toMatch(/"supabase\/functions\/\*\*"/);
    expect(bunfig()).toMatch(/"e2e\/\*\*"/);
  });

  it("does not format or lint with a Node.js tool", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Bun's own formatter and linter replaced both.
    expect(pkg.devDependencies?.["prettier"]).toBeUndefined();
    expect(pkg.dependencies?.["prettier"]).toBeUndefined();
    expect(pkg.devDependencies?.["eslint"]).toBeUndefined();
    expect(pkg.devDependencies?.["eslint-config-next"]).toBeUndefined();
    expect(pkg.dependencies?.["eslint"]).toBeUndefined();
    expect(pkg.dependencies?.["eslint-config-next"]).toBeUndefined();

    expect(pkg.scripts?.format).toBe("bun fmt");
    expect(pkg.scripts?.["format:check"]).toBe("bun fmt --check");
    // The linter is Bun's, and the rules that need types run with `tsrs`.
    expect(pkg.scripts?.lint).toBe("bun lint && bun run lint:types");
    expect(pkg.scripts?.["lint:fix"]).toBe("bun lint --fix");
  });

  it("has no ESLint configuration left behind", () => {
    // The flat config only existed to configure `eslint-config-next`. With
    // Bun's own linter the rules live in bunfig.toml's [lint] section.
    expect(existsSync(join(ROOT, "eslint.config.mjs"))).toBe(false);
    expect(existsSync(join(ROOT, "eslint.config.js"))).toBe(false);
    expect(existsSync(join(ROOT, ".eslintrc.json"))).toBe(false);
  });

  it("does not ask the editor for ESLint or Prettier either", () => {
    // The editor's configuration is configuration too. A workspace that
    // recommends the ESLint and Prettier extensions, and formats on save
    // with Prettier, is a workspace with two more tools in the loop — and
    // two more opinions about what the code should look like.
    //
    // The formatter is Bun's, and it is a command: `bun fmt` is what the
    // gate runs, and the pre-commit hook runs it on the staged files. So
    // the editor does not format on save, and it has no code action to
    // run.
    const settings = readFileSync(join(ROOT, ".vscode/settings.json"), "utf-8");
    const extensions = readFileSync(
      join(ROOT, ".vscode/extensions.json"),
      "utf-8",
    );

    for (const [name, source] of [
      [".vscode/settings.json", settings],
      [".vscode/extensions.json", extensions],
    ] as const) {
      expect({ name, source }).toEqual({
        name,
        source: expect.not.stringMatching(/eslint|prettier/i),
      });
    }

    // And the settings say why the editor does not format.
    const parsed = JSON.parse(settings) as Record<string, unknown>;
    expect(parsed["editor.formatOnSave"]).toBe(false);
    expect(parsed["editor.codeActionsOnSave"]).toEqual({});
  });

  it("points the editor's language server at tsrs", () => {
    // Without this the editor starts the `typescript` package's server:
    // a Node.js program, and a second opinion about the code. `tsrs` has
    // its own language server, and the editor uses it when the directory
    // it is pointed at holds an executable called `tsgo`.
    const settings = JSON.parse(
      readFileSync(join(ROOT, ".vscode/settings.json"), "utf-8"),
    ) as Record<string, unknown>;

    expect(settings["js/ts.tsdk.path"]).toBe(".tsrs-tsdk");
    expect(settings["typescript.tsdk"]).toBe(".tsrs-tsdk");

    // And the directory is made by a script, not by hand.
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["tsrs:tsdk"]).toBe("bun scripts/tsrs-tsdk.ts");
  });

  it("configures the linter in bunfig.toml instead", () => {
    const bunfig = readFileSync(join(ROOT, "bunfig.toml"), "utf-8");

    // The `correctness` category is a superset of what the old ESLint
    // configuration enabled, and a warning fails the run.
    expect(bunfig).toMatch(/^\s*categories\s*=/m);
    expect(bunfig).toMatch(/^\s*maxWarnings\s*=\s*0\s*$/m);
  });

  it("pins the runtime to Bun and never to Node.js", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { engines?: Record<string, string>; packageManager?: string };

    expect(pkg.engines?.["bun"]).toBeDefined();
    expect(pkg.engines?.["node"]).toBeUndefined();
    expect(pkg.packageManager?.startsWith("bun@")).toBe(true);
  });

  it("does not name a Next.js runtime in a route segment config", () => {
    // `export const runtime = "nodejs"` is the only literal "nodejs" left in
    // first-party source. It was always the default, and Next.js 16 deprecates
    // the other value ("edge") and forbids the export entirely under Cache
    // Components. The app is served by Bun, so the segment config has no say
    // in what runs it — and saying "nodejs" out loud only invites the
    // question of what is running it.
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      if (/export\s+const\s+runtime\s*=/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("type checks with tsrs, the Rust port of the TypeScript compiler", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // `tsc` from the TypeScript 7 beta is a Node.js program: its launcher
    // is a `#!/usr/bin/env node` script. `tsrs` is a self-contained Rust
    // binary, so it is the only TypeScript 7 checker this stack can run.
    expect(pkg.scripts?.["typecheck"]).toBe(
      "bun --bun tsrs --noEmit --checkerAssignment go --noLazyMembers",
    );
    expect(pkg.scripts?.["typecheck:tsc"]).toBeUndefined();
    expect(pkg.devDependencies?.["tsrs"]).toBeDefined();
  });
});

describe("bun-only toolchain: no Node.js in the delivery pipeline", () => {
  it("installs and runs everything with Bun", () => {
    const workflows = join(ROOT, ".github", "workflows");
    const offenders: string[] = [];

    for (const file of readdirSync(workflows)) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const source = readFileSync(join(workflows, file), "utf-8");
      if (/actions\/setup-node/.test(source)) {
        offenders.push(`${file}: actions/setup-node`);
      }
      if (/\b(npm|npx|yarn|pnpm)\s+(ci|install|run|exec)\b/.test(source)) {
        offenders.push(`${file}: npm/yarn/pnpm invocation`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("installs without running lifecycle scripts in CI", () => {
    // The only lifecycle script in this repository builds the local Rust
    // audit tool, which CI never uses. Running it would put a Rust
    // toolchain in the critical path of every workflow.
    const workflows = join(ROOT, ".github", "workflows");
    const offenders: string[] = [];

    for (const file of readdirSync(workflows)) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const source = readFileSync(join(workflows, file), "utf-8");
      for (const match of source.matchAll(/bun install[^\n]*/g)) {
        if (!match[0].includes("--ignore-scripts")) {
          offenders.push(`${file}: ${match[0].trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("builds the container from a Bun base image", () => {
    const containerfile = readFileSync(join(ROOT, "Containerfile"), "utf-8");

    expect(containerfile).toMatch(/^FROM oven\/bun:/m);
    expect(containerfile).not.toMatch(/^FROM node:/m);
  });

  it("runs the container as an unprivileged user", () => {
    const containerfile = readFileSync(join(ROOT, "Containerfile"), "utf-8");

    expect(containerfile).toMatch(/^USER bun$/m);
    // Everything the server writes at runtime has to belong to that user.
    expect(containerfile).toMatch(/^COPY --chown=bun:bun/m);
  });

  it("never shells out to a Node.js package manager", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };

    for (const [name, command] of Object.entries(pkg.scripts)) {
      expect(`${name}: ${command}`).not.toMatch(
        /\b(npm|npx|yarn|pnpm|node)\s+[-\w/]+/,
      );
    }
  });
});

describe("bun-only toolchain: one type checker", () => {
  const read = (path: string): string =>
    readFileSync(join(ROOT, path), "utf-8");

  /**
   * Every command a YAML file actually runs.
   *
   * The commands, not the prose: a comment may explain why a checker was
   * dropped, and that is not the same as running it. Parsing the YAML and
   * walking the `run:` values is the difference between "the repository
   * does not use a second type checker" and "the repository does not
   * mention one".
   */
  function* runCommands(node: unknown): Generator<string> {
    if (Array.isArray(node)) {
      for (const item of node) yield* runCommands(item);
      return;
    }
    if (node === null || typeof node !== "object") return;

    for (const [key, value] of Object.entries(node)) {
      if (key === "run" && typeof value === "string") {
        yield value;
        continue;
      }
      yield* runCommands(value);
    }
  }

  it("type checks with tsrs and with nothing else", () => {
    // Bun has a type checker of its own, and it used to sit behind
    // `typecheck:fast` for the pre-commit hook, because `tsrs` could not be
    // given a file list. It can now, but only with `--ignoreConfig`, which
    // drops the path aliases and the rest of the project configuration — a
    // subset check that is not checking the same project. Two checkers mean
    // two sets of diagnostics, and the second one is the one that is less
    // conformant with TypeScript.
    const offenders: string[] = [];

    const scripts = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    for (const [name, command] of Object.entries(scripts.scripts)) {
      if (/\bbun\s+check\b/.test(command)) {
        offenders.push(`package.json: ${name}: ${command}`);
      }
    }

    const yamlFiles = [
      "lefthook.yml",
      ...readdirSync(join(ROOT, ".github", "workflows"))
        .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
        .map((file) => join(".github", "workflows", file)),
    ];
    for (const file of yamlFiles) {
      const parsed = Bun.YAML.parse(read(file));
      for (const command of runCommands(parsed)) {
        if (/\bbun\s+check\b/.test(command)) {
          offenders.push(`${file}: ${command.trim()}`);
        }
      }
    }

    for (const file of files) {
      if (/\bbun\s+check\b/.test(codeOnly(readFileSync(file, "utf-8")))) {
        offenders.push(file);
      }
    }

    // The test tree as well. A test that shells out to another checker
    // puts it in the chain, and the chain is what this rule is about: the
    // tests run in CI, so a checker that runs only in a test still runs
    // on every push.
    const tests = join(ROOT, "__tests__");
    for (const file of walk(tests)) {
      if (!isSource(file)) continue;
      if (/\bbun\s+check\b/.test(codeOnly(readFileSync(file, "utf-8")))) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("runs the one type checker in the pre-commit hook", () => {
    // Over the whole project, not over the staged files: a subset check
    // that cannot see the project configuration is not the same check, and
    // `tsrs` is incremental, so the second run of the day is a fraction of
    // a second.
    const lefthook = Bun.YAML.parse(read("lefthook.yml")) as {
      "pre-commit"?: { commands?: Record<string, { run?: string }> };
    };
    const commands = lefthook["pre-commit"]?.commands ?? {};

    expect(commands.typecheck?.run).toBe("bun run typecheck");
  });
});

describe("bun-only toolchain: Bun's own APIs carry the load", () => {
  const read = (path: string): string =>
    readFileSync(join(ROOT, path), "utf-8");

  it("reads bunfig.toml with Bun's own TOML parser", () => {
    // A regular expression cannot tell `bun = true` from a line of prose
    // that mentions it, and it cannot tell a setting that Bun will act on
    // from one that has been moved under the wrong table. The doctor
    // decides whether this repository runs on Bun, so it has to read the
    // file the way Bun reads it.
    const doctor = read("scripts/doctor.ts");

    expect(doctor).toContain("Bun.TOML.parse");
    expect(doctor).not.toMatch(/bunfig[\s\S]{0,200}?\.match\(/);
  });

  it("reads the coverage report Bun writes instead of scraping its output", () => {
    // The console coverage table is a human-readable rendering, and its
    // shape is not an interface. The lcov report is a data format.
    const gate = read("scripts/coverage-check.ts");

    expect(gate).toContain("--coverage-reporter=lcov");
    expect(gate).toContain("parseLcov");
    // The test output is only ever printed on failure, never parsed.
    expect(gate).not.toMatch(/output\.match\(/);
  });

  it("finds files with Bun's own matcher", () => {
    for (const script of [
      "scripts/lint-migrations.ts",
      "scripts/supabase-migrate.ts",
      "scripts/bundle-size.ts",
    ]) {
      expect(`${script}: ${read(script)}`).toContain("new Bun.Glob(");
    }
  });

  it("declares the dependency trust list explicitly", () => {
    // Bun is default-secure: a dependency's install script does not run
    // unless it is on this list. Naming the list makes the decision
    // visible in the diff instead of leaving it to a built-in default that
    // changes with the runtime.
    const pkg = JSON.parse(read("package.json")) as {
      trustedDependencies?: unknown;
    };

    expect(Array.isArray(pkg.trustedDependencies)).toBe(true);
  });

  it("never auto-installs a dependency at run time", () => {
    // The lockfile is committed, so a missing dependency is a mistake in
    // the working tree. Reaching for the network to paper over it is how
    // an unvetted package gets into a build.
    const bunfig = Bun.TOML.parse(read("bunfig.toml")) as {
      install?: { auto?: string };
    };

    expect(bunfig.install?.auto).toBe("disable");
  });

  it("lets Bun's formatter do the sorting", () => {
    const bunfig = Bun.TOML.parse(read("bunfig.toml")) as {
      fmt?: { sortImports?: boolean; sortTailwindcss?: unknown };
    };

    expect(bunfig.fmt?.sortImports).toBe(true);
    expect(bunfig.fmt?.sortTailwindcss).toBeDefined();
  });

  it("lints with the types in hand, from one type checker", () => {
    // The type-aware rules are the ones that need the type checker: an
    // `any` that came off the network, a promise nobody awaited, a type
    // assertion that changes nothing. The compiler is silent about all
    // three, and a linter without the types cannot see them either.
    //
    // They run with `tsrs`, through its API, and the linter's own
    // type-aware mode is off. The linter gets its types from Bun's own
    // checker, and this repository has one type checker: `tsrs`.
    const bunfig = Bun.TOML.parse(read("bunfig.toml")) as {
      lint?: { typeAware?: boolean; maxWarnings?: number };
    };
    const pkg = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(bunfig.lint?.typeAware).toBe(false);
    expect(bunfig.lint?.maxWarnings).toBe(0);
    expect(pkg.scripts?.["lint:types"]).toBe("bun scripts/type-aware-lint.ts");
    expect(pkg.scripts?.lint).toContain("bun run lint:types");
  });
});
