# CLAUDE.md - AI Assistant Context

This file provides context for AI assistants (Claude Code, Kiro, etc.) working with this codebase.

## Project Overview

**Uptime Monitor** - A self-hosted uptime monitoring application inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), built with Next.js and Supabase.

## Tech Stack

- **Runtime**: Bun 1.4+ (install, scripts, tests, dev server, production server)
- **Framework**: Next.js 16.5 canary (App Router, React 19.3, Turbopack) — served by Bun
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode)
- **Deployment**: Bun container (podman Quadlet)

## Quick Reference

```bash
# Development
bun run dev      # Start dev server on port 3001 (Turbopack), on Bun
bun run build    # Production build, on Bun
bun run lint     # Run ESLint, on Bun
bun run format   # Format with Bun's own formatter (bun fmt)
bun run test     # Unit tests, on Bun's test runner
bun run typecheck  # Type check with tsrs (the Rust port of the TypeScript compiler)
bun run doctor   # Preflight: is this machine set up to run this on Bun?

# Database
# Schema: supabase/schema.sql
# Types: types/database.ts

# Rust Tools
bun run build:audit      # Build the audit binary
tools/audit/target/release/audit --help  # Show help
```

## Project Structure

```
app/                    # Next.js App Router pages
├── (auth)/            # Auth pages (login, signup, mfa)
├── (dashboard)/       # Protected dashboard pages
├── api/               # API routes (cron, notifications, status-pages)
├── auth/              # Auth callbacks
├── status/            # Public status pages
lib/                   # Utilities and services
├── supabase/          # Supabase clients (server, client, service, middleware)
├── actions/           # Server actions
├── env.ts             # Required-env accessors; fail closed
├── client-env.ts      # Browser-side env (Next.js inlines it at build time)
├── security.ts        # Security utilities (SSRF protection, secure compare)
├── notification-types.ts    # Which config fields are credentials
├── notification-channels.ts # Vault-backed channel CRUD (server only)
├── notifications.ts   # Notification dispatchers
├── monitor-checker.ts # Monitor check logic
components/            # Reusable UI components
├── ui/                # shadcn/ui components
tools/                 # Rust binaries built for this repository
├── audit/             # The audit tool: code quality, secrets, favicons
└── probe/             # The monitor probe: connect, TLS, request, timing
types/                 # TypeScript type definitions (incl. bun-modules.d.ts)
scripts/               # Bun scripts (delivery, coverage, bundle size, doctor)
supabase/              # Database schema
├── schema.sql         # Reference schema
├── migrations/        # Applied in order, all idempotent
└── functions/         # Edge Functions (Deno runtime)
    ├── _shared/senders.ts  # Shared by the app and the edge runtime
    └── notification-dispatch/
bunfig.toml            # The Bun policy: node→bun alias, Bun Shell, install pins
Containerfile          # Bun-only production image
deploy/                # podman Quadlet unit + env template
```

## Key Features

- **Monitor Types**: HTTP/HTTPS, TCP, Ping, DNS, Keyword
- **Notifications**: Telegram, Discord, Slack, Teams, Pushover, Webhooks
- **Status Pages**: Public dashboards with custom slugs
- **Incident Tracking**: Automatic incident creation/resolution
- **MFA Support**: TOTP-based two-factor authentication

## Development Commands

```bash
bun run dev      # Start dev server on port 3001 (Turbopack), on Bun
bun run build    # Production build, on Bun
bun run lint     # Run ESLint, on Bun
bun run format   # Format with Bun's own formatter (bun fmt)
bun run test     # Unit tests, on Bun's test runner
bun run doctor   # Preflight: is this machine set up to run this on Bun?

# Rust Tools
bun run build:audit                        # Build audit tool
./tools/audit/target/release/audit generate-favicons  # Generate favicons
./tools/audit/target/release/audit local-cron         # Run local monitor check
```

## Environment Variables

`lib/env.ts` is the single source of truth. Read env through it, never
`process.env.X!` — the assertion suppresses the type error and turns a missing
value into a throw from inside the SDK. `.env.local.example` is the documented
list, and `__tests__/lib/vault-secrets.test.ts` fails if the two drift.
`lib/client-env.ts` holds the browser-only accessors, which read the values
Next.js inlines into the bundle.

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - required
- `SUPABASE_SERVICE_ROLE_KEY` - required, server-side only
- `CRON_SECRET` - authenticates the cron endpoints; the retention-cleanup
  workflow reads it as a repository secret, so rotating it means updating both
- `SITE_URL` (GitHub **Variable**, not a Secret: the app's public URL) -
  where the retention-cleanup workflow posts the daily rollup job
- `VERCEL_AUTOMATION_BYPASS_SECRET` - Vercel Deployment Protection;
  only meaningful on Vercel, unset on the self-hosted Bun deployment
- `NOTIFICATION_DISPATCH_SECRET` - shared with the dispatch Edge Function;
  CI provisions the function's copy via `supabase secrets set`

## Database

- Schema in `supabase/schema.sql`
- Types in `types/database.ts`
- RLS enabled on all tables
- Service role required for heartbeat inserts

## Security Features

- Row Level Security (RLS) on all tables
- Tenant notification credentials in Supabase Vault, reachable only through
  owner-checked `SECURITY DEFINER` functions; a CHECK constraint keeps them out
  of `notification_channels.config`
- `CREATE` on the `public` schema revoked from every role
- SSRF protection for monitor URLs and outbound webhooks, in both runtimes
- DNS pinning in the app runtime: requests go to the validated IP, with the
  hostname kept in the `Host` header and the TLS server name
- Rate limiting on auth endpoints
- Constant-time token comparison
- Strong password requirements (8+ chars, mixed case, numbers)
- Security headers (HSTS, CSP, X-Frame-Options)
- Input validation with Zod

## Runtime

There is no Node.js in this stack. Bun runs everything: the package manager,
the task runner, the formatter, the linter, the unit tests, the scripts, the
Next.js dev server, the type checker, and the production server.

`bunfig.toml` is where that is configured, so "no Node.js" is a _setting_
rather than a convention somebody has to remember.

- **The runtime is the latest Bun canary** (`1.4.3-canary.20261019.1`, which
  reports itself as `1.4.4`). The canary is a moving target, so it is never
  pinned to an exact version in a workflow: CI asks for `bun-version: canary`,
  the npm dist-tag is what tracks it, and `package.json`'s `engines.bun`
  records the floor. The reason for the canary is specific: Bun's own linter,
  formatter and test runner are where the newest work lands first, and this
  repository is built on all three.
  A canary's own number is not the version it reports: `1.4.3-canary.*` is
  the canary _for_ `1.4.4`, so `engines.bun` is `>=1.4.4` and the floor is
  checked against what `Bun.version` says.
- **Never add a `node:*` import.** Use Bun's own APIs: `bun:fs`, `bun:path`,
  `bun:os`, `Bun.dns`, `Bun.connect`, `Bun.file`. The global `crypto`
  exposes `timingSafeEqual` and `getRandomValues`. `bun:fs`, `bun:path` and
  `bun:os` are declared in `types/bun-modules.d.ts` against Bun's own API —
  not re-exported from `@types/node` — so adding a call site means adding a
  signature there.
- **Never invoke `node`, `npm`, `npx`, `yarn` or `pnpm`.** Use `bun`,
  `bunx`, and `bun --bun <binary>`.
- **`bunfig.toml` sets `[run] bun = true`.** Bun then puts a `node` symlink —
  pointing at Bun — at the front of `$PATH` for every command `bun run`
  starts, so a third-party binary with a `#!/usr/bin/env node` shebang still
  runs on Bun. Bun applies this by default only when `node` is _absent_ from
  `$PATH`, so it is stated explicitly: on a machine or a CI runner that has
  Node.js installed, it is the difference between Bun and Node.js. The
  `bun run doctor` preflight fails if the setting is removed.
- **`bunfig.toml` sets `[run] shell = "bun"`.** `package.json` scripts run in
  Bun's own shell, so the toolchain does not depend on `/bin/sh`. Bun Shell
  is a strict subset of POSIX: `if`/`elif`/`fi`, `&&`, `||`, `;`, subshells
  and `>` redirection all work, but fd duplication (`>/dev/null 2>&1`) does
  not. Keep scripts to the subset.
- `bun run <script>` executes a binary through its
  `#!/usr/bin/env node` shebang, which starts Node.js again. Prefix the
  binary with `bun --bun` to keep it on Bun. Every tool invocation in
  `package.json` and `lefthook.yml` does this, and a unit test enforces it.
  Native Bun subcommands (`bun test`, `bun audit`, `bun fmt`)
  are Bun by definition and need no `--bun`.
- **Prettier is gone; `bun fmt` is the formatter.** Bun's formatter is
  Prettier-compatible by default and additionally covers TOML and YAML, so
  the old `.prettierignore` became `[fmt] ignorePatterns` in `bunfig.toml`.
  `bun run format` writes, `bun run format:check` verifies, and
  `bun fmt --doctor` reports any formatter package that is still needed.
- **Bun's formatter also sorts.** `[fmt] sortImports` puts the imports into
  groups — built-ins, external, first-party, relative — and
  `[fmt.sortTailwindcss]` sorts the Tailwind classes using the project's
  own Tailwind v4, which is configured by its stylesheet because v4 has no
  config file. The payoff is not the order: it is that the order stops
  being a matter of taste. A class list that is always written the same way
  produces a diff when it changes and no diff when it does not.
- **ESLint is gone; `bun lint` is the linter.** `bunfig.toml`'s `[lint]`
  section replaced `eslint.config.mjs` and `eslint-config-next`. The
  `correctness` category is a strict **superset** of what
  `eslint-config-next/core-web-vitals` plus `eslint-config-next/typescript`
  enabled — 260 rules instead of 85 — with the same rule families (react,
  react-hooks, jsx-a11y, @next/next, @typescript-eslint) plus oxc, unicorn,
  promise, jest, vitest and bun:test. `maxWarnings = 0` makes a warning a
  failure, so the local run and the CI gate are the same gate.
- **The type-aware rules run with `tsrs`.** The rules that need the type
  checker — an `any` that came off the network, a promise nobody awaited,
  a type assertion that changes nothing, a comparison against an enum
  member written as a string literal — live in `lib/type-aware-lint/`, and
  they ask `tsrs` for the types through its API. `bun run lint` runs them
  after Bun's own rules.
  - **Bun's linter gets its types from Bun's own checker**, so
    `bunfig.toml` sets `[lint] typeAware = false`. Leaving it on would
    check every file twice, with two answers, and the repository has one
    type checker: `tsrs`. The linter's message — "Skipped 15 rules that
    need type information" — is true of Bun's linter and false of the
    repository: those fifteen are the ones `bun run lint:types` runs.
  - **The API is the same program the gate checks with.** `tsrs --noEmit`
    and the rules ask the same compiler the same questions, so a rule
    cannot disagree with the type check about what the code is.
  - **The types come back in one batch.** A type query on its own costs a
    tenth of a millisecond, and a file has thousands of nodes the rules ask
    about, so the driver collects the nodes first and asks the checker for
    every type at once. The requests that cannot be batched — a property
    lookup, a signature — are fired together, because the API pipelines
    them and that is worth nine times the speed.
  - **The rules read the configuration.** `bunfig.toml`'s overrides and
    its `eslint-disable` comments apply here too, so a rule that is off for
    the test tree is off here, and a comment that silences a rule silences
    it.
  - **`__tests__/lib/type-aware-lint.test.ts` holds the expectations.**
    The fixture in `fixtures/type-aware-violations.ts` breaks one rule of
    each kind, and the expectations are in
    `fixtures/type-aware-violations.expected.json`. The file was written by
    running the linter the rules replaced _and_ these rules against the
    fixture and keeping the findings they agreed on, so a rule that stops
    firing, fires somewhere else, or fires twice is a change in the file,
    and the change is visible in the diff.
  - **The comparison is not made against the linter any more, and that is
    the point.** Running it would put a second type checker in the chain
    to check the first one's work, and the chain is what the rest of this
    repository is about. The expectations are the contract now.
  - The fixture has its own `tsconfig.json`, because some of the rules it
    breaks can only be broken by code that does not type check, and the
    compiler is the gate.
  - Enabling the rules meant fixing 244 findings, and most of them were
    real:
  - **`response.json()` is `any`, and it was the root of most of them.**
    `lib/api-client.ts` is now the way the browser talks to the app's own
    API: `fetchJson` validates the body against a Zod schema, so the
    shape of a response is written down in one place and a change on the
    server fails loudly instead of reading `undefined` off a different
    object. The response schemas live next to it.
  - **A type assertion that does not change the type is dead weight.**
    The generated database types already say what a column holds, so
    `data as Monitor[]` and friends were removed rather than kept. The
    `as unknown as never` that the writes used to carry are gone too: a
    Supabase insert or update is now checked against the row type instead
    of waving itself through.
  - **`bun-types` already declares Bun's `tls` fetch option** on
    `RequestInit`, so `lib/security.ts` no longer needs a local type for
    it. The DNS-pinning request keeps the same shape it always had.
  - **The `Deno` global is typed by Deno, not by anything in this
    repository's dependency tree**, so every `Deno.serve` is an `any` to
    Bun's linter and everything through it is an `any` too. The
    `no-unsafe-*` rules are off for `supabase/functions/**`, and the gate
    that matters for those files is `deno task check`, which runs in CI
    against the real `deno.ns` types with `strict` on.
  - **`require-await` is off for the test suite.** A mock has to keep the
    async signature of the thing it replaces, but it has nothing to wait
    for, so the rule would ask it to await a promise it just created.
- **Bun's own rules are enabled too.** `bun/no-cwd-dependent-path`,
  `bun/no-literal-temp-dir`, `bun/no-unportable-commands`,
  `bun/prefer-builtin-sleep`, `bun/prefer-timeout-signal` and friends are
  off by default and only a Bun-aware linter can check them.
- **Every rule that is off has a reason next to it.** The `[lint]` section
  documents each one: `jsx-a11y/prefer-tag-over-role` would mean a component
  refactor rather than a bug fix, `bun/no-env-at-module-scope` is wrong for a
  Next.js app (the build substitutes `process.env.NEXT_PUBLIC_*` at build
  time, so the read has to happen where the text is), and the Deno edge
  functions cannot take a Bun-only API.
- The old ESLint `eslint-disable` comments still work — Bun's linter honours
  them — and it reports the ones that have gone stale.
- **Read the environment through `Bun.env`, not `process.env`.** On the
  server `Bun.env` and `process.env` are the same live object, so the
  value is read from the running process rather than frozen at build time.
  `process.env` survives in exactly four files, and each is deliberate:
  `lib/client-env.ts` and `instrumentation-client.ts` (Next.js substitutes
  `process.env.NEXT_PUBLIC_*` into the browser bundle at build time by
  matching that exact text, and it has no `Bun` global to offer),
  `sentry.edge.config.ts` and `instrumentation.ts` (the edge runtime is a
  V8 isolate with Next's own `process.env`, not Bun). The allowlist is
  asserted in `__tests__/lib/bun-only.test.ts`.
- `lib/env.ts` is isomorphic: it reads `Bun.env` on the server and the
  Next.js-inlined `process.env` in the browser, through one branch.
- **`Bun.argv`, not `process.argv`.** Same object, but it is Bun's own API
  rather than a Node.js compatibility shim.
- **`process.exitCode`, not `process.exit()`.** `process.exit()` truncates
  buffered output when it is piped; setting `process.exitCode` lets Bun
  flush first, so a CI log never loses its last lines.
- **Spawn a process with `Bun.$`, not `child_process`.** Bun's shell API
  escapes interpolated values, runs the command directly with no
  intermediate shell, and returns `{ stdout, stderr, exitCode }` through
  `.nothrow()`. `scripts/coverage-check.ts` uses it to run the test suite.
- **Find files with `Bun.Glob`, not a hand-rolled walk.** It is the
  runtime's own matcher: one traversal, and the paths that match come back
  already filtered. `scripts/lint-migrations.ts`,
  `scripts/supabase-migrate.ts` and `scripts/bundle-size.ts` use it.
  `scanSync` takes a single options object — `{ cwd, onlyFiles }` — not a
  root and an options argument, and `followSymlinks: true` is what makes
  the build-output scan see the traced packages that `.next/node_modules`
  links to.
- **Write files with `Bun.write`, not `writeFile`.** It creates the parent
  directory if it is missing, so a write does not need a `mkdir` beside it
  to keep the two in step.
- **Read `bunfig.toml` with `Bun.TOML.parse`, not a regular expression.**
  A regex cannot tell `bun = true` from a line of prose that mentions it,
  and it cannot tell a setting Bun will act on from one that has been moved
  under the wrong table. `bunfig.toml` is where "this repository has no
  Node.js" is decided, so `scripts/doctor.ts` parses it the way Bun parses
  it. A file Bun cannot read is ignored by Bun in full, so an unparseable
  `bunfig.toml` is a doctor failure, not a warning.
- **The coverage gate reads Bun's lcov report.** `bun test --coverage`
  writes `lcov.info`; the gate parses the `FNF`/`FNH`/`LF`/`LH` records
  and averages the per-file percentages, which is exactly what Bun's own
  "All files" row reports. It used to scrape that row out of the console
  output with a regular expression, and a human-readable rendering is not
  an interface. `COVERAGE_MIN_FILE_FUNCS` and `COVERAGE_MIN_FILE_LINES`
  add an opt-in per-file floor on top of the aggregate one.
- **The coverage measurement is deliberately stable.** Two things decide
  which files the report covers, and both are pinned. The scripts are
  excluded, because each one is a command-line tool whose entry point is a
  process and whose `main()` a unit suite cannot cover; what the scripts
  decide lives in exported functions the suite does cover. And the
  Supabase server client is replaced in `__tests__/setup.ts`, in the
  preload, before any test file loads — because `mock.module` is
  process-wide, so the test _order_ used to decide whether the real module
  was ever evaluated, and the same commit could pass the coverage gate or
  fail it. The number the gate compares does not move with the order.
- **Every file has a floor, not just the aggregate.** The aggregate can
  hide a file that nothing imports any more: it drops out of the report
  and the average barely moves. `scripts/coverage-check.ts` therefore
  holds each file to 80% of its functions and 80% of its lines, on top of
  the 85% / 85% aggregate. `COVERAGE_MIN_FILE_FUNCS` and
  `COVERAGE_MIN_FILE_LINES` raise or lower it; zero turns it off. The
  floor is what caught the two files that hold the notification
  credentials and had no test at all: the aggregate read 86% while
  `lib/notifications.ts` sat at 0% of its functions.
- **The Supabase adapter is behind a seam too.** The store factories take
  the clients they use — `createSupabaseStore(clients)` for the channel
  store, `createSupabaseStore(service)` for the rest — so the queries can
  be asserted without a database. What that buys is the part that is easy
  to get wrong and impossible to see: that a read filters by the owner, and
  that a _batch_ credential read goes through the service-role client while
  a single one goes through the caller's.
- **The audit gate reads `bun audit --json`.** The advisories come back as
  data — a package key and a record per advisory — so the gate can decide
  per advisory instead of testing the tool's output for a sentence. The
  suppressions live in `scripts/audit.ts`, each with a reason, because a
  suppression in a workflow file is invisible in a code review and one in
  code is a line somebody has to argue with when the reason stops being
  true.
- **`install.auto = "disable"`.** Bun's default is to fetch a missing
  dependency on the fly, resolving to `latest` when the lockfile does not
  say otherwise — which is exactly what a compromised registry wants. The
  lockfile is committed, so a missing dependency is a mistake in the
  working tree, not a reason to reach for the network.
- **`package.json` declares `trustedDependencies: []`.** Bun is
  default-secure: a dependency's install script does not run unless it is
  on an allow list. The list being empty is the strongest form of that,
  and the only install scripts in this tree are Node.js ones that have no
  business running. Naming the list makes the decision visible in a diff
  instead of leaving it to a built-in default that moves with the runtime.
- **`Bun.escapeHTML` escapes HTML.** `lib/security.ts` uses it instead of
  a hand-rolled chain of replacements, which produced the same entities
  but had two places to get the order wrong.
- **`tsrs` is the type checker, and it is the only gate**
  (`bun run typecheck`). It is the Rust port of the TypeScript compiler, from
  the Oxc project, tracking TypeScript 7.1 — and it is the only TypeScript 7
  checker that runs in a stack without Node.js: the `tsc` that ships with the
  TypeScript 7 beta is a `#!/usr/bin/env node` program. It is roughly ten
  times faster than `tsc`, and it checks the same project against real
  TypeScript semantics.
  The script runs it with `--checkerAssignment go --noLazyMembers`. The first
  flag puts tsrs on the reference compiler's own file assignment and checker
  history; the second turns off the lazy checker optimizations, which is what
  upstream names as the closest comparison to the Go implementation —
  without it, tsrs canonicalizes some of that history and the diagnostics can
  differ near an instantiation depth limit. No such case was found in this
  repository, so the flag is insurance rather than a fix, and it costs
  nothing measurable: the same speed to within noise, and about 250MB of
  resident memory. Upstream still notes that the Go parser and resolver
  races can vary between runs, so "closest" is the honest word and
  "identical" is not.
  - The other performance options are not used, and the measurements say why.
    `--checkers N` makes no measurable difference on a project this size
    (about 140 source files, and tsrs already scales the thread count down
    to the file count), `--checkerCostCache` was within the noise of the
    uncached run, and `--singleThreaded` is four times slower for 70MB less
    resident memory.
- **There is one type checker, and it is `tsrs`.** Bun has a checker of its
  own, and it used to sit behind `typecheck:fast` for the pre-commit hook,
  on the theory that `tsrs` could not be given a file list: it refused one
  outright, and the only way through was `--ignoreConfig`, which drops the
  path aliases and the rest of the project configuration — a subset check
  that is not checking the same project. `tsrs` is incremental
  (`tsconfig.tsbuildinfo`), so a whole-project run in the hook costs a
  fraction of a second, and one conformant checker is worth more than a fast
  second opinion. The pre-commit hook runs `bun run typecheck` — the whole
  project, the same check CI gates on. `__tests__/lib/bun-only.test.ts` fails
  the build if a second checker appears.
  - **The linter's type-aware rules count.** Bun's linter has its own
    checker behind `[lint] typeAware`, and it is off: the rules are in
    `lib/type-aware-lint/` and they ask `tsrs`.
  - **The editor's language server is `tsrs` too.** By default VS Code
    starts the `typescript` package's server, which is a Node.js program
    and a second opinion about the code. `bun run tsrs:tsdk` makes the
    directory the editor is pointed at, and `.vscode/settings.json` names
    it. The editor does not format on save either: the formatter is
    Bun's, and it is a command — `bun fmt` is what the gate runs, and the
    pre-commit hook runs it on the staged files. A workspace that asks for
    ESLint and Prettier is a workspace with two more tools in the loop.
- **The build does not type check.** `next.config.ts` sets
  `typescript.ignoreBuildErrors`, so `next build` does not repeat the work
  with the slowest of the checkers. The dedicated typecheck workflow is the
  gate, and it is a required job.
- **The `typescript` package is the TypeScript 7 beta**, pinned exactly
  (`7.1.0-beta`). Next.js still needs the package to parse `tsconfig.json`
  for the path aliases; it is not used to type check anything.
- **The Rust probe does the syscall-bound half of a monitor check.**
  `tools/probe` is a standalone binary with no runtime of its own: the cron
  route sends it a batch of jobs and it connects, handshakes, requests and
  times them. The SSRF policy stays in `lib/security.ts` — the probe is
  given an address that has already been resolved and validated, and it
  never resolves a name itself — so there is still exactly one
  implementation of the policy. `lib/probe.ts` is the bridge, and it falls
  back to the in-process implementation whenever the binary is missing, so
  a deployment without Rust is slower rather than broken.
- **Inject dependencies; do not mock modules.** `checkMonitor` takes its
  transport and its policy through `CheckDependencies`, and
  `planMonitorChecks` takes its probe through `ProbeRunner`. A
  `mock.module` in Bun is process-wide: a test that replaced
  `lib/security` would silently change what every other test file sees,
  which is a flaky suite rather than a test.
- **The same rule applies to the database, through a port.**
  `lib/notification-channels.ts` reaches the database through
  `ChannelStore`, `lib/notifications.ts` through `NotificationStore`,
  `lib/analytics.ts` through `AnalyticsStore`, and the monitor state
  machine through `CheckStore`. Each is a list of plain operations that
  resolve to a row or to a message, so nothing about Supabase leaks past
  the port and a test can supply a fake as a plain object. The port is also
  the module's contract with the database, written down: which client
  reads the channel row (the user's) and which reads the credential (the
  service role) is now visible in one place rather than spread through the
  calls.
- **A stub for one caller belongs in its own module.**
  `lib/monitor-checker-runner.ts` exists so the manual-check route can
  have its checker stubbed without `@/lib/monitor-checker` being replaced.
  A `mock.module` is process-wide, so a test that stubbed the whole
  module would hand its stub to every other test file that imports the
  real one — and the state machine's test would silently have been
  testing a recorder. That is not hypothetical: it was exactly what
  happened, and it showed up as a test that passed on its own and failed
  in the suite.
- **The e2e suite runs without a database.** Most of it asserts the auth
  boundaries and the security headers of a running instance, which is
  exactly what has to hold on every deployment, and the specs that need a
  seeded account skip when their variables are unset. `E2E_BASE_URL` makes
  Playwright reuse a server that is already up, so the suite is runnable
  against a production build on a machine with no local Supabase. That is
  the check to reach for before assuming a change is safe.
- **A process-wide mock belongs in the preload.** The Supabase server
  client reads cookies from `next/headers`, which needs a request context
  a unit test does not have, so the suite replaces it. Doing that in
  `__tests__/setup.ts` — which `bunfig.toml` preloads — means the
  replacement happens before any test file loads. A test that needs a
  different fake registers its own, which replaces the default. Doing it
  inside a test file instead leaves the order of the test files deciding
  whether the real module is ever evaluated.
- `bunfig.toml` also sets `[test] randomize = true`, so the suite runs in a
  random order and an inter-test dependency cannot hide. Bun prints the
  seed, so any failure is reproducible with `bun test --seed <n>`.
- `bun run doctor` is the environment preflight: it checks the Bun version,
  that `bunfig.toml` parses, the `node` → Bun alias, the shell, the
  no-orphans setting, the randomized test order, the lockfile against
  `package.json`, the absence of Node.js-only tooling, the formatter, the
  linter and its warning threshold, the type checker, the coverage gate,
  the supply-chain settings, the dependency trust list, the probe binary,
  and the required environment variables. It runs in CI as a gate.
- CI installs with `bun install --frozen-lockfile --ignore-scripts`. The
  only lifecycle script in the repository builds the local Rust audit tool,
  which CI never uses; skipping it keeps a Rust toolchain out of the
  critical path of every workflow.
- The container image runs as the unprivileged `bun` user, and everything it
  copies is owned by that user so the server can write its Next.js cache.
- `Bun.dns.lookup` is the DNS resolver (it returns an array of addresses, and
  reports a family with no records as `DNS_ENOTFOUND`).
- The e2e specs are `*.e2e.mts`, not `*.e2e.ts`, and the Playwright config
  is `playwright.config.mts`, for the same reason. Playwright transforms
  TypeScript for CommonJS files by hooking `require.extensions`, which Bun
  does not implement; its ESM loader path works on Bun. A `.ts` spec fails to
  build with `Unexpected !`.
  - The config is the sharper edge of the two. Playwright loads a `.ts` config
    through `require`, and the hook it installs aliases `require.extensions`
    for `.ts` to the `.js` handler — which is what Bun's own `require` sees
    under Bun, so Bun reads the file as JavaScript. A type annotation in a
    `.ts` config is then a parse error, and the suite fails to start with a
    message that points at the annotation rather than at the loader. Playwright
    looks for `.ts` before `.mts`, so a `.ts` config left behind wins over the
    one that works; `__tests__/app/playwright-config.test.ts` fails the build
    if one reappears.
  - `tsconfig.json` sets `allowImportingTsExtensions` so the config can be
    imported by its real name.
- `@types/node` is not a direct dependency. It is still present in
  `node_modules` because `bun-types` depends on it (Bun implements the
  Node.js API surface, so its type definitions are built on those
  declarations) and Next.js's own types reference them. `tsconfig.json` does
  not list `"node"` in `types`, so the Node.js globals are not opted into.
- The app cannot run on Vercel: Vercel serves Next.js on Node.js. It runs
  from the Bun container in `Containerfile`.
- The Supabase Edge Functions in `supabase/functions/` run on **Deno**, not
  Bun: that is the only runtime Supabase Edge Functions supports. Deno is
  not Node.js, and those functions are deliberately runtime-agnostic — no
  `node:*`, no `Deno.*`, no `process.env` in the shared code.
- `__tests__/lib/bun-only.test.ts` enforces the rules above: no `node:`
  imports, no CommonJS globals, no bare core specifiers, no Node.js type
  surface, no Node.js process API outside the allowlist, no Node.js
  shebangs, no Node.js in CI or in the container image, no ESLint or
  Prettier configuration left behind, and the `bunfig.toml` settings that
  make Bun the whole toolchain. It also enforces the parts that are Bun's
  own APIs rather than Node.js's: that `bunfig.toml` is read with
  `Bun.TOML.parse`, that the coverage gate reads Bun's lcov report instead
  of scraping the console output, that file discovery goes through
  `Bun.Glob`, that the dependency trust list is declared, and that
  auto-install is off.

## Patterns

- Use `@/` path alias for imports
- Server components are default (async functions)
- Client components need `"use client"` directive
- Use explicit type assertions for Supabase queries
- Use `sonner` for toast notifications
- Use `lucide-react` for icons

## Notes

- Signups are disabled (private instance)
- Uses `proxy.ts` for middleware (Next.js 16 pattern)
- Cron runs via GitHub Actions or QStash
- `SUPABASE_PROJECT_REF` is a GitHub **Variable**, not a Secret: it is the
  subdomain of `https://<ref>.supabase.co` and is already public
- `SITE_URL` is a GitHub **Variable**, not a Secret: the app's public URL —
  where the retention-cleanup workflow posts the daily rollup job
- `SENTRY_ORG` and `SENTRY_PROJECT` are GitHub **Variables**: the public
  half of a Sentry project, needed for the source-map upload. The upload
  is skipped when they are missing, and the stack traces in Sentry are then
  not mapped to the source.
- `migrate` and `edge-functions` declare `environment: production`; add
  required reviewers under Settings -> Environments
- **The scripts that touch the live database are tested.**
  `scripts/supabase-migrate.ts` applies migrations to production and
  `scripts/supabase-verify-schema.ts` decides whether the live schema has
  drifted; both were untested, which meant the paths that matter most —
  a token that stopped working, a project the token cannot see, a
  migration that fails half way — were the ones nobody had ever run.
  They export `main` and are guarded by `import.meta.main`, so a test can
  drive them against a stubbed transport. The drift gate now tells an
  unreadable database (exit 3) apart from a drifted one (exit 2): the
  first is a network blip, and reporting it as drift would send an
  operator hunting a migration that was applied perfectly well.
- **A page that reads the environment is rendered per request.**
  `app/gpu-fixture/page.tsx` gates itself on `E2E_GPU_FIXTURE`, which the
  e2e server only sets when it starts — and it declared
  `export const dynamic = "force-dynamic"` because a page that reads
  nothing dynamic is _prerendered_, and a prerender evaluates the gate at
  build time. The built page had its "not found" response baked into the
  HTML, so the flag could never turn the route on and the spec that checks
  it could never pass. `__tests__/app/dynamic-pages.test.ts` now fails the
  build for any page that reads the environment without saying so.
- **The production image is built in CI, and proved to have no Node.js
  in it.** `.github/workflows/container.yml` builds the image the app is
  deployed from and then checks the _artefact_ — `command -v node` in the
  built image must find nothing. Asserting that in a file is weaker than
  proving it on the thing that ships. A `COPY` of a path that no longer
  exists fails the build rather than the app, so
  `__tests__/app/containerfile.test.ts` also checks that every path the
  image copies out of the build stage still exists.
- **`AGENTS.md` is managed by Next.js; `CLAUDE.md` is generated from it.**
  Next.js writes its own blocks into `AGENTS.md` — the `nextjs-agent-rules`
  block, and since 16.5 the `nextjs-agent-upgrade` block — and rewrites them
  on every `next dev` and every `next build`. `CLAUDE.md` is the same
  document under the other name, minus those blocks, and it is generated
  rather than maintained by hand: `bun run agent-docs:sync` regenerates it,
  the pre-commit hook runs that, and a unit test fails the build if the two
  drift. Do not edit `CLAUDE.md` directly, and do not remove the managed
  blocks from `AGENTS.md` — the framework puts them back, and removing them
  from a diff only re-creates the uncommitted change.
- **The Next.js canary is bumped with a script, not by hand.** The
  three-day `minimumReleaseAge` cooldown rejects a canary published minutes
  earlier, so adopting one needs a version-scoped exemption for that build
  and for the ten `@next/*` packages that publish alongside it. Two lists
  kept in step by hand is a chore with a silent failure mode, so
  `bun run bump:next-canary` derives the list from the published manifest
  and moves the version in `package.json` with it. The exemptions stay
  version-scoped on purpose: a blanket package exemption would let any future
  build past the cooldown, which is the whole thing the cooldown is for.

---

## Claude Code Skills

### Supabase Query Pattern

The generated database types already say what a column holds, so a query
needs no assertion to be typed. An assertion that does not change the type
is one the type-aware linter rejects.

```typescript
// Server component
import { createClient } from "@/lib/supabase/server";

const supabase = await createClient(); // async on server!
const { data } = await supabase
  .from("monitors")
  .select("*")
  .eq("user_id", user.id);
// `data` is already `Monitor[]`.
const monitors = data ?? [];

// For inserts, the row type is derived from the table, so the payload is
// checked rather than asserted.
const { data, error } = await supabase
  .from("monitors")
  .insert([monitorData])
  .select()
  .single();
```

### Client vs Server Components

```typescript
// Server component (default) - can be async
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // ...
}

// Client component - needs directive
("use client");
import { createClient } from "@/lib/supabase/client";
const supabase = createClient(); // sync on client
```

### Realtime Subscriptions

```typescript
const channel = supabase
  .channel("channel-name")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "heartbeats",
      filter: `monitor_id=in.(${ids.join(",")})`,
    },
    (payload) => {
      const data = payload.new as Heartbeat;
    },
  )
  .subscribe();

// Cleanup
return () => supabase.removeChannel(channel);
```

### Status Codes

```typescript
// Heartbeat status
const STATUS = { DOWN: 0, UP: 1, PENDING: 2, MAINTENANCE: 3 };

// Incident status
const INCIDENT = { OPEN: 0, RESOLVED: 1, INVESTIGATING: 2 };
```

### Styling Conventions

```tsx
// Use cn() for conditional classes
import { cn } from "@/lib/utils";

// Status-based colors
const statusColors = {
  up: "text-green-400 bg-green-500/20",
  down: "text-red-400 bg-red-500/20",
  pending: "text-neutral-400 bg-neutral-500/20",
};

// Card pattern
<Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 transition-all">
```

### Form Handling

```tsx
// Server action pattern
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createMonitor(formData: FormData) {
  const supabase = await createClient();
  // validate with zod, insert, then:
  revalidatePath("/dashboard/monitors");
  redirect("/dashboard/monitors");
}
```

### Common Imports

```typescript
// Icons
import { AlertCircle, CheckCircle2, Plus, Trash2, XCircle } from "lucide-react";
// Toast notifications
import { toast } from "sonner";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

### Monitor Types

Supported: `http`, `tcp`, `ping`, `keyword`, `dns`
Schema supports (not implemented): `docker`, `steam`

### Heartbeat Result Semantics

`lib/monitor-status.ts` is the single source of truth for how a raw check
result becomes a stored status. Change behaviour there, not in the checker.

- `HEARTBEAT_STATUS` — 0 DOWN, 1 UP, 2 PENDING, 3 MAINTENANCE, 4 DEGRADED.
  `lib/monitor-checker.ts` emits DEGRADED when a check succeeds but exceeds
  `getDegradedThresholdMs` (80% of the monitor's timeout), so it is a live
  state, not a reserved one.
- `determineEffectiveStatus` — applies the retry window. It holds the previous
  state only while that state represents health; MAINTENANCE and DEGRADED fall
  back to PENDING so a monitor that starts failing during a maintenance window
  surfaces the outage instead of staying "intentionally offline".
- `nextConsecutiveUptime` — UP increments, DOWN resets, and PENDING /
  DEGRADED / MAINTENANCE suspend the streak (planned work and slow-but-
  answering checks must not erase uptime).
- `classifyErrorType` — derives a stable category from the human-readable
  `msg` so dashboards can group failures. Returns null for UP, DEGRADED and
  MAINTENANCE; PENDING still classifies because it means "failed, inside the
  retry window". The existing `idx_heartbeats_error_type` index depends on
  this column being written.

Columns declared in `supabase/schema.sql` but not yet populated are marked
`RESERVED:`. Do not read them as live data.

### Notification Channel Types

`telegram`, `discord`, `slack`, `teams`, `pushover`, `webhook`, `email` (planned)

### Notification Credentials (Vault)

Channels are written server-side through `lib/notification-channels.ts`; the
browser never talks to `notification_channels` directly.

- `splitChannelConfig(type, config)` in `lib/notification-types.ts` decides what
  is a credential. `SENSITIVE_CONFIG_KEYS` must stay in lockstep with the
  backfill and the CHECK constraint in
  `supabase/migrations/20260927094500_add_vault_notification_secrets.sql`.
- The server splits again on write, so a client that puts a credential in
  `config` still cannot get it stored there.
- Reads go through the `notification_channel_secret` /
  `notification_channel_secrets` RPCs. An update's `secret` is **partial**:
  an omitted key keeps the stored credential.
- `resolveChannelConfigs()` batches a fan-out into one vault read.
- `supabase/functions/_shared/senders.ts` must stay runtime-agnostic: no
  `node:*` imports, no `Deno.*`, no `process.env`. Each caller injects its own
  `NotificationTransport`, which is where its egress policy lives.
