# Uptime Monitor

A self-hosted uptime monitoring application inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), built with Next.js and Supabase.

[Live Demo](https://uptime-monitor-next.vercel.app/)

## Features

- **Multiple Monitor Types**: HTTP/HTTPS, TCP, Ping, DNS, Keyword
- **Notifications**: Telegram, Discord, Slack, Teams, Pushover, Webhooks
- **Status Pages**: Public dashboards with custom slugs
- **Incident Tracking**: Automatic incident creation and resolution
- **SSL Monitoring**: Certificate expiration alerts
- **MFA Support**: TOTP-based two-factor authentication
- **Real-time Updates**: WebSocket-powered live dashboard
- **Component Modularization**: Deeply modularized UI components for maintainability
- **Sentry Integration**: Full error tracking and performance monitoring across all runtimes

## Tech Stack

- **Runtime**: Bun 1.4 canary (install, scripts, tests, lint, format, dev server, production server)
- **Framework**: Next.js 16.5 canary (App Router, React 19.3, Turbopack) — served by Bun
- **Type checking**: `tsrs` (the Rust port of the TypeScript 7 compiler)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode - 0 errors)
- **CI/CD**: GitHub Actions (typecheck, build, lint all passing)
- **Deployment**: Bun container (podman Quadlet)
- **Error Tracking**: Sentry (client, server, Edge runtimes)

### One runtime: Bun

There is no Node.js anywhere in this stack — not as a package manager, not as a
script host, not in CI, not as the production runtime.

| Concern            | Runtime                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| Install / lockfile | `bun install` with `bun.lock`                                          |
| Task runner        | `bun run <script>`; every third-party binary is invoked as `bun --bun` |
| Task shell         | Bun's own shell (`bunfig.toml` → `[run] shell = "bun"`)                |
| Type checker       | `tsrs` (the Rust port of `tsc`) — the only one in the repository       |
| Formatter          | `bun fmt` (Bun's own formatter — Prettier was removed)                 |
| Linter             | `bun lint` (Bun's own linter — ESLint was removed)                     |
| Unit tests         | `bun test` (Bun's own runner, happy-dom for the DOM)                   |
| Script host        | `bun` — `bun:fs`, `bun:path`, `bun:os`                                 |
| Monitor probe      | `tools/probe` — a Rust binary, no runtime of its own                   |
| Dev server         | `bun --bun next dev`                                                   |
| Production server  | `bun --bun next start` (see [Deployment](#deployment))                 |
| CI                 | `oven-sh/setup-bun@v2` only — no `actions/setup-node`                  |
| Edge functions     | Deno (Supabase Edge runtime — a different runtime, not Node.js)        |

### Bun's own APIs do the work

Removing Node.js is the easy half. The other half is letting Bun's own
APIs carry the load, so nothing is hand-rolled against a Node.js-shaped
interface that Bun already implements:

| Concern         | Bun API                                               | Where                                             |
| --------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Config parsing  | `Bun.TOML.parse`                                      | `scripts/doctor.ts` reads `bunfig.toml` with it   |
| File discovery  | `Bun.Glob`                                            | the migration, bundle-size and lint scripts       |
| File writing    | `Bun.write` (creates the parent directory too)        | every script that writes an artifact              |
| HTML escaping   | `Bun.escapeHTML`                                      | `lib/security.ts`                                 |
| Shell           | `Bun.$`                                               | `scripts/coverage-check.ts` runs the suite        |
| Subprocesses    | `Bun.spawn`                                           | `lib/probe.ts` runs the Rust probe                |
| DNS             | `Bun.dns.lookup`                                      | `lib/security.ts` resolves and pins               |
| Sockets         | `Bun.connect`                                         | `lib/monitor-checker.ts`                          |
| Tables          | `Bun.inspect.table`                                   | `scripts/bundle-size.ts` prints the largest files |
| Coverage        | `bun test --coverage` + Bun's lcov report             | `scripts/coverage-check.ts` reads `lcov.info`     |
| Formatting      | `bun fmt` with `sortImports` and `sortTailwindcss`    | `bunfig.toml` `[fmt]`                             |
| Type-aware lint | `bun run lint:types`, with the types from `tsrs`      | `lib/type-aware-lint/`                            |
| Package policy  | `install.auto = "disable"`, `trustedDependencies: []` | `bunfig.toml` and `package.json`                  |

Three of these are worth the extra words.

**The doctor reads `bunfig.toml` with `Bun.TOML.parse`.** `bunfig.toml` is
where "this repository has no Node.js" is actually decided, so a setting
that is quietly dropped has to fail the build. A regular expression cannot
tell `bun = true` from a line of prose that mentions it; a parse can only
see a value Bun itself will act on. An unparseable `bunfig.toml` is a
failure too, because Bun ignores the whole file when it cannot read it.

**The type-aware rules run with `tsrs`.** The rules that need the type
checker — an `any` that came off the network, a promise nobody awaited, a
type assertion that changes nothing, a comparison against an enum member
written as a string literal — live in `lib/type-aware-lint/` and ask `tsrs`
for the types through its API. `bun run lint` runs them after Bun's own
rules.

Bun's linter gets its types from Bun's own checker, so `bunfig.toml` sets
`[lint] typeAware = false`. Leaving it on would check every file twice,
with two answers, and the repository has one type checker: `tsrs`. The
linter's message — _"Skipped 15 rules that need type information"_ — is true
of Bun's linter and false of the repository: those fifteen are the ones
`bun run lint:types` runs.

The rules ask the same program the gate checks with, so a rule cannot
disagree with the type check about what the code is. The types come back in
one batch per file, because a type query on its own costs a tenth of a
millisecond and a file has thousands of nodes the rules ask about. The
configuration applies too: `bunfig.toml`'s overrides and its
`eslint-disable` comments turn rules off here exactly as they do there.

`__tests__/lib/type-aware-lint.test.ts` runs both implementations against a
fixture that breaks one rule of each kind and compares them rule by rule
and place by place.

Turning the rules on meant fixing 244 findings, and the biggest cluster had
one root cause: `response.json()` is typed `any`, and every field read off
it was too.

`lib/api-client.ts` is the fix. `fetchJson` validates a response against a
Zod schema, so the shape of every API response the browser reads is written
down in one place, and a change on the server fails loudly instead of
reading `undefined` off a different object. It costs about 20 KiB gzipped
in the browser.

**The coverage gate reads Bun's lcov report.** `bun test --coverage` writes
`lcov.info`; the gate parses the `FNF`/`FNH`/`LF`/`LH` records and averages
the per-file percentages, which is exactly what Bun's own "All files" row
reports. It used to scrape that row out of the console output with a
regular expression, and a human-readable rendering is not an interface.

**The number the gate compares does not move.** Two things decide which
files the report covers, and both are pinned. The command-line scripts are
excluded, because each one is a tool whose entry point is a process and
whose `main()` no unit suite can cover. And the Supabase server client is
replaced in the test preload, before any test file loads — `mock.module` is
process-wide, so the test _order_ used to decide whether the real module was
ever evaluated, and the same commit could pass the coverage gate or fail it.

**Every file has a floor, not just the aggregate.** An aggregate can hide
a file that nothing imports any more: it drops out of the report and the
average barely moves. The gate holds each file to 80% of its functions and
80% of its lines, on top of the 85% / 85% aggregate.

That floor is not decoration. It is what the coverage report exposed: the
aggregate read 86% while `lib/notifications.ts` and
`lib/notification-channels.ts` — the code that holds a tenant's
notification credentials and contacts a vendor with them — sat at **0% of
their functions**. Both are now behind a port and covered, and the
aggregate reads 97%.

### The runtime is the latest Bun canary

`1.4.3-canary.20261019.1`, which reports itself as `1.4.4`. The canary is a
moving target, so it is never pinned to an exact version in a workflow: CI
asks for `bun-version: canary` and the npm dist-tag is what tracks it.
`package.json`'s `engines.bun` records the floor. The reason for the canary is
specific — Bun's own linter, formatter and test runner are where the newest
work lands first, and this repository is built on all three.

A canary's own number is not the version it reports: `1.4.3-canary.*` is the
canary _for_ `1.4.4`, so `engines.bun` is `>=1.4.4` and the floor is checked
against what `Bun.version` says.

### The framework is a canary too

Next.js is pinned to an exact canary build — `16.5.0-canary.20` — rather than
to the floating `canary` dist-tag, because Bun's cached registry metadata can
resolve that tag to a stale build.

The three-day supply-chain cooldown in `bunfig.toml` rejects a canary
published minutes earlier, so adopting one needs a version-scoped exemption
for that build and for the ten `@next/*` packages that publish alongside it.
Keeping two lists in step by hand is a chore with a silent failure mode, so
the list is derived from the published manifest instead:

```bash
bun run bump:next-canary              # move to the current canary and install
bun run bump:next-canary -- --dry-run # show what would change
```

The exemptions stay version-scoped on purpose. A blanket package exemption
would let any future build of `next` past the cooldown, which is the whole
thing the cooldown is for.

### Type checking: `tsrs`, not `tsc`

| Checker | Command             | Time  | What it is                                     |
| ------- | ------------------- | ----- | ---------------------------------------------- |
| `tsrs`  | `bun run typecheck` | ~0.2s | The Rust port of the TypeScript compiler (Oxc) |

`tsrs` tracks TypeScript 7.1 and is the **only TypeScript 7 checker that runs
without Node.js**: the `tsc` that ships with the TypeScript 7 beta is a
`#!/usr/bin/env node` program. It is roughly ten times faster than `tsc` and
checks the same project against real TypeScript semantics. It is the gate:
CI, `verify:delivery` and the pre-commit hook all run it.

It is invoked with `--checkerAssignment go --noLazyMembers`. The first flag
puts tsrs on the reference compiler's own file assignment and checker history;
the second turns off the lazy checker optimizations, which is what upstream
names as the closest comparison to the Go implementation — without it, tsrs
canonicalizes some of that history and the diagnostics can differ near an
instantiation depth limit. No such case was found in this repository, so the
flag is insurance rather than a fix, and it costs nothing measurable: the same
speed to within noise, and about 250MB of resident memory. Upstream still
notes that the Go parser and resolver races can vary between runs, so
"closest" is the honest word and "identical" is not.

The other performance options are not used, and the measurements say why.
`--checkers N` makes no measurable difference on a project this size — about
140 source files, and tsrs already scales the thread count down to the file
count. `--checkerCostCache` was within the noise of the uncached run.
`--singleThreaded` is four times slower for 70MB less resident memory.

There is **one** type checker. Bun has a checker of its own, and it used to
sit behind `typecheck:fast` for the pre-commit hook, on the theory that `tsrs`
could not be given a file list: it refused one outright, and the only way
through was `--ignoreConfig`, which drops the path aliases and the rest of the
project configuration — a subset check that is not checking the same project.
`tsrs` is incremental (`tsconfig.tsbuildinfo`), so a whole-project run in the
hook costs a fraction of a second, and one conformant checker is worth more
than a fast second opinion.

The `typescript` package is still present, pinned to the latest beta
(`7.1.0-beta`), because Next.js needs it to parse `tsconfig.json` for the
path aliases. It type checks nothing: `next.config.ts` sets
`typescript.ignoreBuildErrors`, so the build does not repeat the work with
the slowest of the checkers. The dedicated typecheck workflow is the gate.

### Two agent documents, one of them generated

Next.js writes its own guidance into `AGENTS.md` — the `nextjs-agent-rules`
block, and since 16.5 the `nextjs-agent-upgrade` block — and rewrites them
on every `next dev` and every `next build`. The framework owns those blocks;
removing them from a diff only re-creates the uncommitted change.

`CLAUDE.md` is the same document under the other name, because the two agents
read different files. It is **generated**, not maintained by hand:

```bash
bun run agent-docs:sync            # regenerate CLAUDE.md from AGENTS.md
bun run agent-docs:sync -- --check # fail if the two have drifted
```

The pre-commit hook runs the sync, and a unit test fails the build if the
two drift. Without that, a hand-maintained pair falls out of step the first
time the framework rewrites its blocks.

### The monitor probe is Rust

`tools/probe` is a standalone binary with no runtime of its own. The cron
route sends it a batch of jobs and it connects, handshakes, requests and
times them — the syscall-bound half of a monitor check.

The SSRF policy stays in `lib/security.ts`. The probe is given an address
that has already been resolved and validated, and it never resolves a name
itself, so there is still exactly one implementation of the policy. When
the binary is missing, `lib/probe.ts` falls back to the in-process
implementation: a deployment without Rust is slower, not broken.

`bunfig.toml` is where that is configured, so "no Node.js" is a setting rather
than a convention somebody has to remember:

- `[run] bun = true` puts a `node` symlink — pointing at Bun — at the front
  of `$PATH` for every command `bun run` starts. A third-party binary with a
  `#!/usr/bin/env node` shebang still runs on Bun. Bun applies this by default
  only when `node` is _absent_ from `$PATH`, so it is stated explicitly: on a
  machine or a CI runner that has Node.js installed, it is the difference
  between Bun and Node.js.
- `[run] shell = "bun"` runs `package.json` scripts in Bun's own shell, so the
  toolchain does not depend on `/bin/sh`.
- `[install] exact = true` and `[install] minimumReleaseAge` pin what gets
  installed: no drifting version ranges, and nothing published in the last
  three days, which is the usual window for a compromised release to be
  detected and yanked.
- `[test] randomize = true` runs the suite in a random order so an inter-test
  dependency cannot hide. Bun prints the seed, so a failure is reproducible.

`bun --bun` is what keeps it that way. `bun run <script>` hands a binary to
the OS, which follows its `#!/usr/bin/env node` shebang and starts Node.js
again; `bun --bun <binary>` runs it on Bun's runtime instead. Every script in
`package.json` that shells out to a tool is prefixed with it, and a unit test
(`__tests__/lib/supabase-delivery.test.ts`) fails the build if one is missed.
Native Bun subcommands — `bun test`, `bun audit`, `bun fmt`, `bun lint` — are
Bun by definition and need no prefix.

### The linter is Bun's too

`bun lint` replaced ESLint and `eslint-config-next`. The `correctness`
category in `bunfig.toml` is a strict **superset** of what
`eslint-config-next/core-web-vitals` plus `eslint-config-next/typescript`
enabled — 260 rules instead of 85 — with the same rule families (react,
react-hooks, jsx-a11y, @next/next, @typescript-eslint) plus oxc, unicorn,
promise, jest, vitest and bun:test. `maxWarnings = 0` makes a warning a
failure, so a local run and the CI gate are the same gate.

Bun's own rules are enabled too — `bun/no-cwd-dependent-path`,
`bun/no-literal-temp-dir`, `bun/no-unportable-commands`,
`bun/prefer-builtin-sleep` — because they are off by default and only a
Bun-aware linter can check them. Every rule that is switched off has the
reason written next to it in `bunfig.toml`.

Removing ESLint and Prettier took **289 packages** out of the dependency
tree: 746 → 457.

`bun run doctor` is the preflight: it checks the Bun version, the `node` →
Bun alias, the lockfile against `package.json`, the absence of Node.js-only
tooling, the formatter, the linter, the type checker, and the required
environment variables. It runs in CI as a gate.

The app's own code uses Bun's APIs directly: `Bun.dns.lookup` for DNS,
`Bun.connect` for TCP probes, `Bun.env` for the environment, `Bun.argv` for
arguments, `Bun.$` for spawning processes, `crypto.timingSafeEqual` for
constant-time comparison, and `fetch` with a pinned IP for SSRF-protected
requests. The `undici` dependency is gone.

There is no `node:` import, no `@types/node` in `tsconfig.json`'s `types`, and
no Node.js type surface: `types/bun-modules.d.ts` declares `bun:fs`,
`bun:path` and `bun:os` against Bun's own API rather than re-exporting the
Node.js shapes. `__tests__/lib/bun-only.test.ts` enforces all of it — no
`node:` specifiers, no CommonJS globals, no bare core imports, no Node.js
process API outside a four-file allowlist, no Node.js shebangs, no Node.js in
CI or in the container image, no ESLint or Prettier configuration left
behind, and the `bunfig.toml` settings above.

The only `process.env` left in the codebase is deliberate: Next.js substitutes
`process.env.NEXT_PUBLIC_*` into the browser bundle at build time by matching
that exact text, and the edge runtime is a V8 isolate with Next's own
`process.env` rather than Bun.

## Components

### New UI Components (Phase 2 Modularization)

| Component                                | Description                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `components/ui/stat-box.tsx`             | Reusable stat box with status colors, sublabels, and highlight support  |
| `components/ui/response-chart.tsx`       | SVG-based response time chart with gradient fill and axis labels        |
| `components/ui/monitor-card.tsx`         | Reusable monitor card with duplicate/edit actions, status-based styling |
| `components/ui/monitor-status-badge.tsx` | Color-coded status badge (up/down/pending) with icons                   |

### Refactored Components

- `components/live-monitors.tsx` - Now uses `MonitorCard` component
- `components/monitor-detail-panel.tsx` - Now uses `StatBox` and `ResponseChart`

### All New Components Use:

- Explicit TypeScript types with proper type assertions (`as unknown as never`)
- `cn()` from `@/lib/utils` for conditional classNames
- Only used icons imported from `lucide-react` (clean imports)
- Proper `aria-label` attributes for accessibility
- Tailwind CSS v4 styling patterns

## CI/CD Pipeline

GitHub Actions workflows are configured for automated quality checks on every push to `main`:

| Workflow         | Trigger                | Checks                                                    |
| ---------------- | ---------------------- | --------------------------------------------------------- |
| **typecheck**    | Push/PR to main        | `tsrs`: 0 type errors                                     |
| **build**        | Push/PR to main        | Production build + bundle-size guard (10% limit)          |
| **lint**         | Push/PR to main        | `bun lint`: 0 problems (260 rules)                        |
| **test**         | Push/PR to main        | Bun coverage gate: 70% funcs / 80% lines                  |
| **audit**        | Push/PR + weekly (Mon) | `bun audit`: 0 vulnerabilities                            |
| **quality-gate** | Push/PR to main        | Typecheck, lint, unit coverage, build, and Playwright e2e |

Every workflow asks for the latest Bun canary (`bun-version: canary`). The
canary is a moving target, so an exact version would be wrong within a day;
the npm dist-tag is what tracks it. Bun's package cache is restored from the
Actions cache, keyed on `bun.lock`.

CI installs with `bun install --frozen-lockfile --ignore-scripts`. The only
lifecycle script in the repository builds the local Rust audit tool, which CI
never uses; skipping it keeps a Rust toolchain out of the critical path of
every workflow and matches what the container image already does.

The test job runs `bun run doctor` as a gate, and writes a JUnit XML report
and an lcov report from the same single test run (`COVERAGE_JUNIT_PATH` and
`COVERAGE_LCOV_DIR`).

The audit job reads `bun audit --json`, so it decides per advisory instead of
grepping the tool's output for a sentence. Advisories that are deliberately
suppressed live in `scripts/audit.ts`, each with a reason, and they are always
printed in the report.

### Workflow Files

- `.github/workflows/typecheck.yml` - `bun run typecheck` (tsrs)
- `.github/workflows/build.yml` - `bun run build` + `bun run bundle-size`
- `.github/workflows/lint.yml` - `bun run lint` + `bun run format:check`
- `.github/workflows/test.yml` - `bun run doctor` + `bun run coverage-check`
- `.github/workflows/audit.yml` - `bun run audit`
- `.github/workflows/quality-gate.yml` - `bun run verify:delivery` equivalent checks

All checks must pass before merge. See `.github/workflows/` for full workflow definitions.

## Testing

Automated component tests run with Bun's test runner and happy-dom. `bunfig.toml` preloads `__tests__/setup.ts`, which registers DOM globals and mocks `next/navigation` plus the `duplicateMonitor` server action:

```bash
bun run test
bun run e2e:install
bun run e2e
bun run verify:delivery
```

`bun run e2e:ci` runs a **preflight check first** (`scripts/e2e-preflight.ts`)
that launches a browser once up front. If the binary is missing it fails
immediately with the exact install command, instead of surfacing as a
mid-suite Playwright error that looks like a product failure. `bun run e2e`
starts its own dedicated server, so it does not depend on a dev server already
running on the port.

Tests that need a seeded account (`E2E_EMAIL` / `E2E_PASSWORD`) or a published
status page (`E2E_PUBLIC_STATUS_SLUG`) skip when those are unset; CI sets them
and fails loudly if they are missing.

### Running the e2e suite without a database

Most of the e2e suite needs no database at all: it asserts the **auth
boundaries** and the **security headers** of a running instance, and those
assertions are exactly the ones that must hold on every deployment. The
specs that need a seeded account skip when their variables are unset.

That makes the suite runnable against any instance, including a production
build on a machine with no local Supabase:

```bash
# Terminal 1 — a real build, served by Bun.
bun run build
NEXT_PUBLIC_SUPABASE_URL=... CRON_SECRET=... bun --bun next start -p 3101

# Terminal 2 — the suite, against the instance that is already running.
E2E_BASE_URL=http://127.0.0.1:3101 E2E_PRODUCTION=1 bun run e2e
```

`E2E_BASE_URL` makes Playwright reuse a server that is already up instead of
starting its own. The result is a full end-to-end pass — real browser, real
routes, real middleware — with the two seeded specs skipped.

The e2e specs are named `*.e2e.mts` on purpose, and the Playwright config is
`playwright.config.mts` for the same reason. Playwright transforms TypeScript
for CommonJS files by hooking `require.extensions`, which Bun does not
implement; the ESM loader path it uses for `.mts` works on Bun. A `.ts` spec
fails to build with `Unexpected !` — the TypeScript is parsed as JavaScript.

The config is the sharper edge. Playwright loads a `.ts` config through
`require`, and the hook it installs points `require.extensions` for `.ts` at
the `.js` handler — which is what Bun's own `require` sees under Bun, so Bun
reads the file as JavaScript. A type annotation in a `.ts` config is then a
parse error, and the suite fails to start with a message that points at the
annotation rather than at the loader. Playwright looks for `.ts` before
`.mts`, so a `.ts` config left behind would win over the one that works.

| Test File                                               | Component            | Coverage                                           |
| ------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| `__tests__/components/ui/monitor-card.test.tsx`         | `MonitorCard`        | Name, URL, labels, icon, menu, states, error toast |
| `__tests__/components/ui/monitor-status-badge.test.tsx` | `MonitorStatusBadge` | Down/Up/Pending labels and color classes           |
| `__tests__/components/ui/response-chart.test.tsx`       | `ResponseChart`      | Chart render, empty state, aria-label, axis values |
| `__tests__/components/ui/stat-box.test.tsx`             | `StatBox`            | Label/value, sublabel, highlight/muted classes     |
| `__tests__/components/ui/card.test.tsx`                 | `Card/*`             | Slots, custom classes, muted/semibold styling      |
| `__tests__/components/ui/dropdown-menu.test.tsx`        | `DropdownMenu/*`     | Trigger open, items, inset, separator, classes     |
| `__tests__/lib/security.test.ts`                        | `lib/security`       | Timing-safe compare, XSS sanitize, SSRF guards     |
| `__tests__/lib/ssl-utils.test.ts`                       | `lib/ssl-utils`      | Expiry math, warn logic, status labels, formatting |
| `__tests__/lib/qstash.test.ts`                          | `lib/qstash`         | Interval↔cron transforms, timezone handling        |

### Security Audits

```bash
bun run audit
```

Fails CI if any known vulnerability is found. Run `bun audit fix` to upgrade
vulnerable packages within their declared ranges.

## Sentry Integration

Sentry is fully configured across all Next.js 16 runtimes:

| Runtime     | Config File               | DSN                      |
| ----------- | ------------------------- | ------------------------ |
| **Browser** | `sentry.client.config.ts` | `NEXT_PUBLIC_SENTRY_DSN` |
| **Server**  | `sentry.server.config.ts` | `NEXT_PUBLIC_SENTRY_DSN` |
| **Edge**    | `sentry.edge.config.ts`   | `NEXT_PUBLIC_SENTRY_DSN` |

### Replay Integration

- Client: 1.0 in dev, 0.1 in prod
- Server: 1.0 in dev, 0.1 in prod
- Edge: 1.0 in dev, 0.1 in prod

### Performance Monitoring

- App-wide tracing with optimized sample rates
- Source maps uploaded in CI (disabled in development)
- Tunnel route: `/monitoring`

### Environment

Add `NEXT_PUBLIC_SENTRY_DSN` to `.env.local.example` (template provided).

### Source Map Upload

- Powered by `@sentry/nextjs` webpack plugin
- Widen client file upload enabled for prettier stack traces
- Silent mode in CI (`silent: !process.env.CI`)

## Git Hooks (Lefthook)

Pre-commit and pre-push hooks run automatically:

- **Pre-commit**: TypeScript, Bun's linter, Bun's formatter, debug statements, secrets, JSON validation
- **Commit-msg**: Conventional commits format, message length
- **Pre-push**: Full type check, production build, branch naming

## Development Tools

This project includes a **Rust-based audit tool** (`tools/audit`) for code quality, security checks, and automation.

### Building the Audit Tool

```bash
bun run build:audit
```

> Requires Rust/Cargo. Skipped automatically if Cargo is not installed.

### Audit Commands

```bash
# Generate favicons from SVG
./tools/audit/target/release/audit generate-favicons

# Run monitor checks locally (uses CRON_SECRET env var)
./tools/audit/target/release/audit local-cron

# Run once instead of looping
./tools/audit/target/release/audit local-cron --once

# Test Vercel protection bypass
./tools/audit/target/release/audit test-bypass

# Clean up old Vercel deployments
./tools/audit/target/release/audit vercel-cleanup
```

## Deployment

The app is served by Bun. It is not a Node.js app with a Bun front door: the
production server is `bun --bun next start`, and the image contains no Node.js
binary.

```bash
# Build the image (podman or docker).
#
# The build args are the public Supabase coordinates. Next.js inlines them
# into the browser bundle, and only inlines what is present when it builds:
# a variable that is missing at build time stays a runtime lookup, and the
# browser's `process` polyfill has an empty `env`, so it resolves to nothing.
# The result is a sign-in form that cannot find its own Supabase URL.
#
# They are public values — they are in the client bundle either way. The
# service role key is not one of them, and stays in the runtime env file.
podman build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -t uptime-monitor:latest -f Containerfile .

# Run it
podman run --rm -p 3000:3000 \
  --env-file deploy/uptime-monitor.env \
  uptime-monitor:latest
```

For a persistent deployment, `deploy/uptime-monitor.container` is a
[Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html)
unit — the systemd-in-a-podman way to run a container as a service:

```bash
podman machine ssh podman-machine -- mkdir -p ~/.config/containers/systemd
podman machine scp deploy/uptime-monitor.container \
  podman-machine:~/.config/containers/systemd/
podman machine ssh podman-machine -- systemctl --user daemon-reload
podman machine ssh podman-machine -- systemctl --user enable --now uptime-monitor.service
```

Secrets live in an env file on the host (`~/.config/uptime-monitor/env`),
never in the unit file and never in the repository. Start from
`deploy/uptime-monitor.env.example`.

### Cutover notes

> **Pause the Vercel project's automatic deployments before merging the
> Bun-only change.** Vercel serves Next.js on Node.js, and the monitor code
> path is Bun-only (`Bun.dns.lookup`, `Bun.connect`), so a Vercel build of
> this branch serves pages but fails every monitor check.

- The app was previously deployed to Vercel. It cannot run there any more:
  Vercel serves Next.js on Node.js, and the monitor code path is Bun-only
  (`Bun.dns.lookup`, `Bun.connect`).
- The route cache policy that used to live in `vercel.json` now lives in
  `next.config.ts`, so it applies on any host.
- `VERCEL_AUTOMATION_BYPASS_SECRET` is only meaningful on Vercel. It is still
  listed in `.env.local.example` so the documented-variable list stays in one
  place; leave it unset on a self-hosted deployment.

## Environment Variables

See `.env.local.example` for all required variables:

| Variable                          | Description                                  | Required          |
| --------------------------------- | -------------------------------------------- | ----------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL                         | Yes               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anonymous key                       | Yes               |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase service role key                    | Yes               |
| `NEXT_PUBLIC_SITE_URL`            | Public URL of deployment                     | Yes               |
| `CRON_SECRET`                     | Secret for cron job authentication           | Yes               |
| `QSTASH_TOKEN`                    | QStash API token                             | If QStash is used |
| `QSTASH_CURRENT_SIGNING_KEY`      | QStash signing key                           | If QStash is used |
| `QSTASH_NEXT_SIGNING_KEY`         | QStash next signing key                      | If QStash is used |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass secret for Vercel Auth                | No                |
| `NOTIFICATION_DISPATCH_SECRET`    | Shared secret for the dispatch Edge Function | No                |
| `ADMIN_USER_IDS`                  | Users allowed to change the schedule         | No                |
| `NEXT_PUBLIC_SENTRY_DSN`          | Sentry DSN for error tracking                | Yes               |

`lib/env.ts` is the single source of truth: it is the only place that reads
these, and it fails with the variable name instead of the `process.env.X!`
non-null assertion that used to turn a missing value into a throw from inside
the Supabase SDK. `__tests__/lib/vault-secrets.test.ts` fails if this table and
`.env.local.example` drift apart.

### Secret Management

Secrets are **never** committed. `.env.local` is gitignored; only
`.env.local.example` (placeholders + generation guidance) is tracked, and a
`secrets-check` pre-commit hook blocks credential-shaped strings from landing.

**Where secrets live**

| Scope           | Mechanism                                                | Used for                                                                      |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| CI/CD           | GitHub Actions repository **Secrets**                    | `SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`, `NOTIFICATION_DISPATCH_SECRET`  |
| CI/CD           | GitHub Actions repository **Variables**                  | `SUPABASE_PROJECT_REF`                                                        |
| Local dev       | `.env.local` (gitignored)                                | Same variables for `next dev`, tests, and `audit local-cron`                  |
| Migrations      | `SUPABASE_ACCESS_TOKEN` + `--project-ref`                | `scripts/supabase-migrate.ts` over the Management API; never in `config.toml` |
| Runtime (prod)  | Container env file (`deploy/uptime-monitor.env.example`) | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `QSTASH_*`, Sentry                |
| Edge Function   | `supabase secrets set` (the function's own store)        | `NOTIFICATION_DISPATCH_SECRET`                                                |
| **Tenant data** | **Supabase Vault** (`vault.secrets`)                     | Per-tenant notification credentials, one row per channel                      |

Non-secret configuration belongs in GitHub **Variables**, not Secrets.
`SUPABASE_PROJECT_REF` is the subdomain of `https://<ref>.supabase.co` and is
already public through `NEXT_PUBLIC_SUPABASE_URL`, so it is a variable.

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are runtime-only. They used to be
listed as required CI secrets, which led to two secrets being set in GitHub that
nothing read.

### Supabase Vault: tenant notification credentials

`notification_channels.config` used to hold every credential a channel needs —
Telegram bot tokens, Discord/Slack/Teams webhook URLs, Pushover tokens, SMTP
passwords. The dashboard read that column straight from the browser, so any XSS,
malicious extension, or devtools session on the edit page recovered all of it in
cleartext.

Credentials now live in `vault.secrets`:

- `notification_channels.secret_id` points at the vault row. `config` holds only
  non-sensitive settings (a Telegram `chat_id`, a webhook `method`).
- The vault is reachable **only** through owner-checked `SECURITY DEFINER`
  functions: `notification_channel_secret`, `notification_channel_secrets`,
  `notification_channel_set_secret`, `notification_channel_clear_secret`. Direct
  grants on `vault.secrets` and `vault.decrypted_secrets` are revoked from
  `anon` and `authenticated`.
- The `notification_channels_config_has_no_secrets` CHECK constraint refuses a
  credential written into `config`, so the split cannot silently regress.
- The edit form never receives a credential. It shows a "stored" state and
  treats an empty field as "keep what is stored"; rotation is a partial write.
- Deleting a channel deletes its vault row, via a `BEFORE DELETE` trigger.

RLS already gave strict tenant isolation — Vault adds what RLS cannot: the
credential is not readable by the browser at all, and a tenant can rotate a
token without a redeploy.

### Edge Functions

`supabase/functions/notification-dispatch` sends a notification for a saved
channel without the credential entering the Next.js runtime. It authenticates
with `NOTIFICATION_DISPATCH_SECRET` from its own secret store, then reads the
credential from Vault.

`_shared/senders.ts` holds the message formats and is imported by **both** the
app and the function, so the two paths cannot drift. Each side injects its own
egress policy: the app uses `lib/security.ts` (`Bun.dns.lookup`), the function
uses `_shared/egress.ts` (`Deno.resolveDns`). The shared module may not import
`node:*` or use `Deno.*`; a test enforces that, and `deno task check` runs in
the PR-only `validate` job.

Delivery of downtime alerts still runs in the Next.js runtime. Moving it behind
the function is a follow-up, gated on measuring the function's latency and
reliability rather than assuming them.

**Required GitHub repository secrets**

`SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN` (source-map upload only; builds
succeed without it), and `NOTIFICATION_DISPATCH_SECRET`.

**Required GitHub repository variables**

`SUPABASE_PROJECT_REF`.

**One-time setup**

`migrate` and `edge-functions` declare `environment: production`. Add required
reviewers and a wait timer under **Settings → Environments → production**, or
the environment is a label rather than a gate.

## Project Structure

```
├── app/                      # Next.js App Router
│   ├── (auth)/               # Auth pages (login, signup, mfa)
│   ├── (dashboard)/          # Protected dashboard pages
│   ├── api/                  # API routes
│   └── status/               # Public status pages
├── components/               # React components
│   └── ui/                   # shadcn/ui components
│     ├── stat-box.tsx        # Stat box with status colors
│     ├── response-chart.tsx  # Response time chart
│     ├── monitor-card.tsx    # Monitor card with actions/duplication
│     └── monitor-status-badge.tsx  # Color-coded status badge
├── lib/                      # Utilities and services
│   ├── supabase/             # Supabase clients
│   ├── actions/              # Server actions
│   ├── env.ts                # Single source of truth for required env vars
│   ├── notification-channels.ts  # Vault-backed channel CRUD (server only)
│   ├── notification-types.ts    # Which config fields are credentials
│   ├── notifications.ts      # Notification dispatchers
│   └── monitor-checker.ts    # Monitor check logic
├── supabase/                 # Database schema and migrations
│   ├── schema.sql            # Reference schema
│   ├── migrations/           # Applied in order, all idempotent
│   └── functions/            # Edge Functions
│       ├── _shared/senders.ts  # Shared by the app and the edge runtime
│       └── notification-dispatch/
├── tools/audit/              # Rust CLI tool
├── types/                    # TypeScript type definitions
└── .github/                  # GitHub Actions workflows
    ├── workflows/
    │   ├── typecheck.yml
    │   ├── build.yml
    │   ├── lint.yml
    │   ├── test.yml
    │   ├── quality-gate.yml
    │   ├── supabase-migrations.yml
    │   └── audit.yml
├── sentry.server.config.ts
└── sentry.edge.config.ts
```

## Security

- Row Level Security (RLS) on all database tables
- Tenant notification credentials in Supabase Vault, not readable by the browser
- `CREATE` on the `public` schema revoked from every role
- SSRF protection for monitor URLs and outbound webhooks, in both runtimes
- Rate limiting on auth endpoints
- MFA support with TOTP
- Security headers (HSTS, CSP, X-Frame-Options)
- Secrets detection in pre-commit hooks
- Sentry DSN restricted to trusted origins

## License

MIT
