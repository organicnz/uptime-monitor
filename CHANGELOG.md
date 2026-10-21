# Changelog

All notable changes to the Uptime Monitor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Bun-only runtime**: Node.js is gone from the stack — package manager
  (`bun.lock`), task runner, unit tests, scripts, CI, and the production
  server all run on Bun.
  - Every third-party binary is invoked as `bun --bun <binary>`. Plain
    `bun run <script>` follows a binary's `#!/usr/bin/env node` shebang and
    starts Node.js again; `bun --bun` keeps it on Bun. A unit test fails the
    build if a script forgets.
  - `bun:fs`, `bun:fs/promises`, `bun:path` and `bun:os` replace the `node:*`
    imports in `scripts/` and `__tests__/`, with ambient types in
    `types/bun-modules.d.ts`.
  - `lib/security.ts` resolves DNS with `Bun.dns.lookup` and pins requests to
    the validated IP, keeping the hostname in the `Host` header and the TLS
    server name. The `undici` dependency is gone; DNS pinning now works in
    production instead of being refused outside the Node.js runtime.
  - `lib/monitor-checker.ts` probes TCP with `Bun.connect`.
  - CI installs Bun only: `actions/setup-node` is removed from every workflow.
- **Type checking runs on `tsrs`**: `bun run typecheck` is now
  `tsrs --noEmit --checkerAssignment go` — the Rust port of the TypeScript 7
  compiler, which is 100% conformant with the reference implementation and the
  only TypeScript 7 checker that runs without Node.js. It was previously a
  second-class gate that only `verify:delivery` and the pre-commit hook
  reached.
  - `--checkerAssignment go` puts tsrs on the reference compiler's own file
    assignment and checker history, so the diagnostics match exactly rather
    than approximating.
  - `bun check` stays as `bun run typecheck:fast`, for the pre-commit hook
    only: tsrs is project-scoped the way `tsc` is and refuses a file list.
  - `bun run typecheck:watch` and `bun run typecheck:lsp` are new.
  - Measured on this repository, tsrs is about three times _faster_ than
    `bun check` over the whole project (249ms against 761ms), so it is the
    right default rather than the slow-but-thorough one.
- **Next.js 16.5 canary**: `next` 16.4.2 → 16.5.0-canary.20, `react` and
  `react-dom` → 19.3.1, `@types/react` and `@types/react-dom` → 19.3.0, and
  `bun-types` → the Bun canary that matches the runtime.
  - The canary is pinned to an exact build rather than the floating `canary`
    dist-tag, because Bun's cached registry metadata can resolve that tag to
    a stale build.
  - The three-day `minimumReleaseAge` cooldown rejects a canary published
    minutes earlier, so `bunfig.toml` exempts `next` and the ten `@next/*`
    packages that publish alongside it. Each exemption is scoped to one exact
    version, so the next canary has to be opted into deliberately instead of
    sliding in on the previous one's exemption.
- **The runtime pin names a version that exists**: `packageManager` was
  `bun@1.4.4-canary.1`, which was never published — canaries are
  `1.4.3-canary.YYYYMMDD.N`. It is now the current canary, and
  `engines.bun` is `>=1.4.4`, the version a canary actually reports.
- **The `runtime` route segment config is gone**: six API routes declared
  `export const runtime = "nodejs"`. That was always the default, Next.js 16
  deprecates the only other value, and Cache Components forbids the export
  entirely. A unit test now fails the build if it comes back.
- **Delivery scripts are TypeScript**: `scripts/supabase-migrate.py` and
  `scripts/supabase-verify-schema.py` are now `scripts/supabase-migrate.ts`
  and `scripts/supabase-verify-schema.ts`, the expected-schema table is a
  shared module the unit test imports directly, and the migration idempotency
  lint is `scripts/lint-migrations.ts` — the same linter the unit test uses.
  `actions/setup-python` is removed from CI.
- **Deployment**: the app is served by Bun from `Containerfile`, with a podman
  Quadlet unit in `deploy/`. The route cache policy that lived in
  `vercel.json` moved into `next.config.ts`, so it applies on any host.
- Removed the unused `jsdom`, `@testing-library/jest-dom` and `@types/jest`
  dependencies; the test globals now come from `bun:test`.

### Added

- **Automated Test Suite**: Component tests with Bun test runner + happy-dom (`bun run test`: 22 pass, 0 fail)
  - `__tests__/components/ui/monitor-card.test.tsx` - MonitorCard render and accessibility
  - `__tests__/components/ui/monitor-status-badge.test.tsx` - Status badge labels and color classes
  - `__tests__/components/ui/response-chart.test.tsx` - Chart render, empty state, axis values
  - `__tests__/components/ui/stat-box.test.tsx` - Label/value, sublabel, highlight/muted classes
  - `__tests__/setup.ts` - DOM globals + `next/navigation` / server-action mocks (preloaded via `bunfig.toml`)
  - `test.yml` - GitHub Actions workflow running the suite on push/PR to `main`
- **Accessibility Roles**: Queryable ARIA roles on all new components (`article`/`group`/`status`/`img`) alongside existing `aria-label`s
- **Security Audit Gate**: `audit.yml` workflow + `bun run audit` script (fails CI on known vulnerabilities)
- **Editor Config**: VS Code format-on-save with Prettier default, ESLint fix on save, recommended extensions
- **DNS pinning tests**: the request target, the `Host` header, the TLS server
  name, and the rejection of a host that answers with a private address
- **The doctor checks the type checker**: `bun run doctor` now reports
  whether `tsrs` is installed and whether `bun run typecheck` is the script
  that runs it, alongside the runtime, the lockfile, the formatter and the
  linter.

### Fixed

- **The container image could not sign a browser in**: Next.js inlines a
  `NEXT_PUBLIC_*` member access into the client bundle, and only inlines what
  is present when it builds. The image build had neither the Supabase URL nor
  the anon key — `.env.local` is excluded from the build context, because it
  is where the secrets live — so the bundle kept a runtime lookup that the
  browser's empty `process` polyfill resolved to nothing.
  - The build stage now takes them as build arguments. They are public
    values, which is what the `NEXT_PUBLIC_` prefix means: they are in the
    client bundle either way. The service role key is not one of them, and
    still comes from the runtime environment.
  - The same build-time resolution applies to the Content-Security-Policy's
    `connect-src` allowlist, which `next.config.ts` computes from the same
    URL. A custom Supabase domain has to be present at build time for it to
    be allowed.
- **The browser could not read any `NEXT_PUBLIC_*` variable**: `lib/env.ts`
  read the environment as a whole object, but Next.js inlines only a
  `process.env.NEXT_PUBLIC_*` _member access_ — the browser's `process`
  polyfill has an empty `env`. Every public variable was therefore
  `undefined` in the browser, and the sign-in form failed with "Missing
  required environment variable NEXT_PUBLIC_SUPABASE_URL" instead of
  signing in.
  - The public variables are now read with the member-access form, which is
    the only one the bundler substitutes.
  - A unit test reads the source and asserts the shape, because the suite
    runs on Bun — where `Bun.env` and `process.env` are the same object —
    and can never exercise the browser branch.
- **The DNS monitor bypassed the SSRF-protected transport**: `checkDns`
  accepted the injected dependencies and ignored them, reaching `dns.google`
  through the global `fetch` rather than the pinned, injected transport. The
  probe path resolved hosts through the module import for the same reason,
  which left `CheckDependencies.resolveUrl` unused. Every network and policy
  call now goes through the injection, and the DNS monitor has tests.
- **Critical Next.js RCEs**: Upgraded `next` 16.3.2 → 16.3.3 (GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4)
- **Transitive vulnerabilities**: `sharp`, `fast-uri`, `js-yaml` upgraded via `bun audit fix` (0 vulnerabilities remaining)

## [0.2.0] - 2026-09-10

### Added

- **Component Modularization**: Deeply componentized UI components for better maintainability
  - `components/ui/stat-box.tsx` - Reusable stat box with status colors and sublabels
  - `components/ui/response-chart.tsx` - SVG-based response time chart with gradient fill
  - `components/ui/monitor-card.tsx` - Monitor card with duplicate/edit actions and dropdown menu
  - `components/ui/monitor-status-badge.tsx` - Color-coded status badge (up/down/pending)
- **Sentry Full Integration**: Error tracking and performance monitoring across all runtimes
  - `sentry.client.config.ts` - Browser initialization with DSN and replay integration
  - `sentry.server.config.ts` - Node.js initialization with optimized sampling
  - `sentry.edge.config.ts` - Edge runtime initialization
  - `instrumentation.ts` - Sentry register and onRequestError export
- **GitHub Actions CI/CD**: Automated quality checks on every push
  - `typecheck.yml` - TypeScript strict mode typechecking
  - `build.yml` - Production Next.js build verification
  - `lint.yml` - ESLint enforcement
- **Accessibility Improvements**: ARIA labels and keyboard navigation support across all new components
- **Repository Documentation**: Updated README with component diagrams, CI/CD status, and Sentry configuration

### Changed

- **Refactored `live-monitors.tsx`**: Now uses `MonitorCard` component
- **Refactored `monitor-detail-panel.tsx`**: Now uses `StatBox` and `ResponseChart` components
- **Clean imports**: Only used icons imported from `lucide-react` (no unused imports)
- **TypeScript strict mode**: 0 errors across all files
- **ESLint**: 0 errors, 0 warnings (pre-existing svgo.config.mjs warning only)
- **Sentry DSN**: Added `NEXT_PUBLIC_SENTRY_DSN` to `.env.local.example`

### Fixed

- **Security**: Robust SSRF guards and Zod validation for monitor URLs
- **Type safety**: Replaced unsafe casts with proper type assertions (`as unknown as never`)
- **Database schema**: Added seed template and RLS policies

### Deprecated

- None

### Removed

- None

### Security

- **SSRF protection**: Enhanced URL validation for all monitor types
- **Secret management**: Removed hardcoded secrets, added pre-commit hook detection
- **Sentry**: Full-stack error tracking with performance monitoring

## [0.1.0] - 2026-09-10

### Added

- Initial release of Uptime Monitor
- Core monitor types: HTTP/HTTPS, TCP, Ping, DNS, Keyword
- Notification channels: Telegram, Discord, Slack, Teams, Pushover, Webhooks
- Status pages with custom slugs
- Incident tracking and resolution
- MFA support with TOTP
- Real-time updates via WebSocket
- Rust-based audit tool (`tools/audit`)
- QStash cron job support
- Vercel deployment configuration
- Sentry basic configuration
- TypeScript strict mode
- ESLint configuration
- Tailwind CSS v4 styling
- Next.js 16 App Router

---

Generated from conventional commit messages across `main` branch.
