# Changelog

All notable changes to the Uptime Monitor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Automated Test Suite**: Component tests with Bun test runner + happy-dom (`bun run test`: 22 pass, 0 fail)
  - `__tests__/components/ui/monitor-card.test.tsx` - MonitorCard render and accessibility
  - `__tests__/components/ui/monitor-status-badge.test.tsx` - Status badge labels and color classes
  - `__tests__/components/ui/response-chart.test.tsx` - Chart render, empty state, axis values
  - `__tests__/components/ui/stat-box.test.tsx` - Label/value, sublabel, highlight/muted classes
  - `__tests__/setup.ts` - DOM globals + `next/navigation` / server-action mocks (preloaded via `bunfig.toml`)
  - `test.yml` - GitHub Actions workflow running the suite on push/PR to `main`
- **Accessibility Roles**: Queryable ARIA roles on all new components (`article`/`group`/`status`/`img`) alongside existing `aria-label`s

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
