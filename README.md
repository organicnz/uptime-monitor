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

| Scope           | Mechanism                                         | Used for                                                                      |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| CI/CD           | GitHub Actions repository **Secrets**             | `SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`, `NOTIFICATION_DISPATCH_SECRET`  |
| CI/CD           | GitHub Actions repository **Variables**           | `SUPABASE_PROJECT_REF`                                                        |
| Local dev       | `.env.local` (gitignored)                         | Same variables for `next dev`, tests, and `audit local-cron`                  |
| Migrations      | `SUPABASE_ACCESS_TOKEN` + `--project-ref`         | `scripts/supabase-migrate.py` over the Management API; never in `config.toml` |
| Runtime (prod)  | Vercel project environment                        | `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `QSTASH_*`, Sentry                |
| Edge Function   | `supabase secrets set` (the function's own store) | `NOTIFICATION_DISPATCH_SECRET`                                                |
| **Tenant data** | **Supabase Vault** (`vault.secrets`)              | Per-tenant notification credentials, one row per channel                      |

Non-secret configuration belongs in GitHub **Variables**, not Secrets.
`SUPABASE_PROJECT_REF` is the subdomain of `https://<ref>.supabase.co` and is
already public through `NEXT_PUBLIC_SUPABASE_URL`, so it is a variable.

`SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are Vercel-only. They used to be
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
egress policy: the app uses `lib/security.ts` (`node:dns`), the function uses
`_shared/egress.ts` (`Deno.resolveDns`). The shared module may not import
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
