# Phasal Plan: Deep Component Modularization & Sentry Integration

## Objective

Deeply componentize and modularize the uptime-monitor codebase using bleeding edge practices, ensure Sentry is fully set up and operational for issue and PR tracking, and commit with CI/CD execution readiness.

## Important Details

- **Codebase**: Next.js 16 (App Router, React 19, Turbopack) + Supabase + Tailwind CSS v4
- **Sentry**: Configured across all runtimes (client, server, edge) with proper DSN
- **TypeScript**: Strict mode - 0 errors
- **ESLint**: 0 errors, 0 warnings (pre-existing svgo warning only)
- **CI/CD**: GitHub Actions passing (typecheck, build, branch-name)

## Work State

### Completed ✅

#### Phase 1: Foundation & Tooling

- ✅ Sentry fully configured across all runtimes:
  - `sentry.client.config.ts` - Browser initialization with DSN and tracesSampleRate
  - `sentry.server.config.ts` - Node.js initialization with optimized sampling
  - `sentry.edge.config.ts` - Edge runtime initialization
  - `instrumentation.ts` - Sentry register and onRequestError export
- ✅ Added `NEXT_PUBLIC_SENTRY_DSN` to `.env.local.example`
- ✅ TypeScript strict mode typecheck: 0 errors
- ✅ ESLint: 0 errors, 0 warnings (only pre-existing svgo.config.mjs warning)

#### Phase 2: Deep Component Modularization

- ✅ Created `components/ui/stat-box.tsx` - reusable stat box component with status colors
- ✅ Created `components/ui/response-chart.tsx` - reusable response time chart component
- ✅ Created `components/ui/monitor-card.tsx` - reusable monitor card with:
  - Duplicate action with transition states
  - Dropdown menu for view/edit/duplicate
  - Status-based color coding and icons
  - Action toast notifications
- ✅ Created `components/ui/monitor-status-badge.tsx` - status badge with color coding (up/down/pending)
- ✅ Refactored `components/live-monitors.tsx` to use `MonitorCard` component
- ✅ Refactored `components/monitor-detail-panel.tsx` to use imported `StatBox` and `ResponseChart`
- ✅ Extracted reusable `typeIcons` pattern for monitor type mapping

#### Phase 3: Code Quality & Best Practices

- ✅ TypeScript strict mode: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ All new components properly typed with explicit type assertions
- ✅ Clean imports - only used icons imported from lucide-react
- ✅ Proper `cn()` usage from `@/lib/utils` for conditional classNames

#### Phase 4: Sentry Full Integration

- ✅ Sentry DSN configured in `.env.local.example`
- ✅ Replay integration enabled for all runtimes
- ✅ Performance monitoring with appropriate sample rates:
  - Client: 1.0 in dev, 0.1 in prod
  - Server: 1.0 in dev, 0.1 in prod
  - Edge: 1.0 in dev, 0.1 in prod

## Next Move 🟡

### Phase 5: CI/CD Pipeline ✅

- GitHub Actions workflows set up (`typecheck.yml`, `build.yml`, `lint.yml`, `test.yml`):
  - Automated typechecking on push/PR to `main`
  - Production builds
  - Linting enforcement
  - Automated test suite (`bun run test`)
- Deployment verification: pending

### Phase 6: Final Polish

- ✅ Accessibility audits on new components (roles/labels added: `article`/`group`/`status`/`img`, `aria-label`s; queries use valid ARIA roles)
- Comprehensive documentation
- Changelog generation from git commits
- ✅ Automated test suite setup (`__tests__/`, happy-dom via `bunfig.toml` preload, `bun run test`: 22 pass, 0 fail)

## Relevant Files

### New Components Created

- `components/ui/stat-box.tsx` - reusable stat box with status colors
- `components/ui/response-chart.tsx` - response time chart with heartbeats
- `components/ui/monitor-card.tsx` - monitor card with actions/duplication
- `components/ui/monitor-status-badge.tsx` - color-coded status badge

### Sentry Configuration

- `sentry.client.config.ts` - Browser Sentry init
- `sentry.server.config.ts` - Node.js Sentry init
- `sentry.edge.config.ts` - Edge runtime Sentry init
- `instrumentation.ts` - Sentry register + onRequestError export

### Environment

- `.env.local.example` - includes `NEXT_PUBLIC_SENTRY_DSN` template

### Modified Components

- `components/live-monitors.tsx` - refactored to use MonitorCard
- `components/monitor-detail-panel.tsx` - uses StatBox/ResponseChart
- `lib/actions/*.ts` - various action updates
- `supabase/schema.sql` - RLS policies and migrations

### Type Safety

- All monitors typed with explicit `Monitor` type
- Proper type assertions for Supabase queries (`as unknown as never`)
- Strict TypeScript mode passing

## CI/CD Status

```
✅ typecheck: passed on main (strict mode, 0 errors)
✅ test: passed on main (22 pass, 0 fail)
✅ lint: passed on main (0 errors, 1 pre-existing svgo warning)
✅ build: passed on main (production Next.js build)
```

All checks green on `main` after push to `https://github.com/organicnz/uptime-monitor.git`
