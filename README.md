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

- **Framework**: Next.js 16 (App Router, React 19, Turbopack)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode - 0 errors)
- **CI/CD**: GitHub Actions (typecheck, build, lint all passing)
- **Error Tracking**: Sentry (client, server, Edge runtimes)

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
| **typecheck**    | Push/PR to main        | TypeScript strict mode: 0 errors                          |
| **build**        | Push/PR to main        | Production build + bundle-size guard (10% limit)          |
| **lint**         | Push/PR to main        | ESLint: 0 errors and 0 warnings                           |
| **test**         | Push/PR to main        | Bun coverage gate: 70% funcs / 80% lines                  |
| **audit**        | Push/PR + weekly (Mon) | `bun audit`: 0 vulnerabilities                            |
| **quality-gate** | Push/PR to main        | Typecheck, lint, unit coverage, build, and Playwright e2e |

### Workflow Files

- `.github/workflows/typecheck.yml` - `bun run typecheck`
- `.github/workflows/build.yml` - `bun run build` + `bun run bundle-size`
- `.github/workflows/lint.yml` - `bun run lint` + `bun run format:check`
- `.github/workflows/test.yml` - `bun run coverage-check`
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
| **Node.js** | `sentry.server.config.ts` | `NEXT_PUBLIC_SENTRY_DSN` |
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

- **Pre-commit**: TypeScript, ESLint, Prettier, debug statements, secrets, JSON validation
- **Commit-msg**: Conventional commits format, message length
- **Pre-push**: Full type check, production build, branch naming

## Development Tools

This project includes a **Rust-based audit tool** (`tools/audit`) for code quality, security checks, and automation.

### Building the Audit Tool

```bash
npm run build:audit
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

## Environment Variables

See `.env.local.example` for all required variables:

| Variable                          | Description                        | Required |
| --------------------------------- | ---------------------------------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL               | Yes      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anonymous key             | Yes      |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase service role key          | Yes      |
| `NEXT_PUBLIC_SITE_URL`            | Public URL of deployment           | Yes      |
| `CRON_SECRET`                     | Secret for cron job authentication | Yes      |
| `QSTASH_TOKEN`                    | QStash API token                   | Yes      |
| `QSTASH_CURRENT_SIGNING_KEY`      | QStash signing key                 | Yes      |
| `QSTASH_NEXT_SIGNING_KEY`         | QStash next signing key            | Yes      |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass secret for Vercel Auth      | No       |
| `NEXT_PUBLIC_SENTRY_DSN`          | Sentry DSN for error tracking      | Yes      |

### Secret Management

Secrets are **never** committed. `.env.local` is gitignored; only
`.env.local.example` (placeholders + generation guidance) is tracked, and a
`secrets-check` pre-commit hook blocks credential-shaped strings from landing.

**Where secrets live**

| Scope          | Mechanism                                        | Used for                                                                                 |
| -------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| CI/CD          | GitHub Actions repository/org **Secrets**        | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `SENTRY_AUTH_TOKEN` |
| Local dev      | `.env.local` (gitignored)                        | Same variables for `next dev`, tests, and `audit local-cron`                             |
| Migrations     | `SUPABASE_ACCESS_TOKEN` secret + `--project-ref` | `supabase db push` in `supabase-migrations.yml`; never hardcoded in `config.toml`        |
| Runtime (prod) | Vercel project environment variables             | Same set, injected at build/runtime                                                      |

**Why there is no Supabase Vault or Edge Functions secret store**

This app has no `supabase/functions/` directory, so there is no Edge Function
whose secrets need co-locating. Access control is enforced in the **database**
via RLS on all tables, which is strictly stronger than relying on a
function-held secret: a leaked service key still cannot read another tenant's
rows through the anon/authenticated roles. Vault would only add value if we
needed secret _rotation without a redeploy_, which this workload does not.

Adopt Vault/Edge Functions when — and only when — one of these becomes true:

- secrets must rotate without a deploy or app restart, or
- privileged logic must run close to the database (e.g. outbound webhooks that
  must not traverse the Next.js runtime), or
- a non-Human actor (Edge Function) needs its own scoped credential.

**Required GitHub repository secrets**

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and
`SENTRY_AUTH_TOKEN` (the last only for source-map upload; builds succeed
without it). Non-secret configuration (project ref, site URL) belongs in
GitHub **Variables**, not Secrets.

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
│   ├── notifications.ts      # Notification dispatchers
│   └── monitor-checker.ts    # Monitor check logic
├── supabase/                 # Database schema and migrations
├── tools/audit/              # Rust CLI tool
├── types/                    # TypeScript type definitions
└── .github/                  # GitHub Actions workflows
    ├── workflows/
    │   ├── typecheck.yml
    │   ├── build.yml
    │   └── lint.yml
└── sentry/
    ├── sentry.client.config.ts
    ├── sentry.server.config.ts
    └── sentry.edge.config.ts
```

## Security

- Row Level Security (RLS) on all database tables
- SSRF protection for monitor URLs
- Rate limiting on auth endpoints
- MFA support with TOTP
- Security headers (HSTS, CSP, X-Frame-Options)
- Secrets detection in pre-commit hooks
- Sentry DSN restricted to trusted origins

## License

MIT
