# Uptime Monitor - Phasal Execution Plan

## Overview

This plan systematically improves the codebase by deeply componentizing, modularizing, and ensuring Sentry is fully operational. Each phase builds upon the previous one.

---

## Phase 1: Foundation & Tooling

### Objectives

- Set up proper Sentry configuration with all runtimes
- Enable TypeScript strict mode checks
- Configure ESLint and Prettier properly
- Add missing environment variables

### Tasks

1. **Sentry Configuration** (`sentry.*` configs):
   - Ensure `NEXT_PUBLIC_SENTRY_DSN` is set in `.env.local`
   - Configure `tracesSampleRate` appropriately (1.0 for dev, lower for prod)
   - Add `replayIntegration` with proper sampling
   - Set up `debug` mode based on `NEXT_PUBLIC_NODE_ENV`

2. **Instrumentation** (`instrumentation.ts`):
   - Complete the `register()` function to init Sentry per runtime
   - Export `onRequestError` for middleware usage

3. **TypeScript & Linting**:
   - Run `npm run typecheck` to find type errors
   - Run `npm run lint` to find lint errors
   - Fix all issues

4. **Environment Variables**:
   - Verify `.env.local` has all required vars
   - Add example if missing

### Deliverables

- ✅ Sentry initialized across all runtimes (client, server, edge)
- ✅ TypeScript typecheck passes
- ✅ ESLint passes with no errors
- ✅ All env vars documented

---

## Phase 2: Deep Component Modularization

### Objectives

- Extract reusable UI components
- Create component composition patterns
- Remove duplication
- Standardize styling patterns

### Tasks

#### 2.1 Extract Reusable Components

- [ ] **StatBox** → Already exists but needs extraction to `components/ui/stat-box.tsx`
- [ ] **ResponseChart** → Already exists but needs extraction to `components/ui/response-chart.tsx`
- [ ] **MonitorStatusBadge** → Extract status logic to reusable hook/component
- [ ] **StatsCard** → Already exists, ensure it's fully reusable

#### 2.2 Create Component Library

- [ ] `components/ui/button.tsx` → Already exists, verify best practices
- [ ] `components/ui/card.tsx` → Already exists, add variants
- [ ] `components/ui/input.tsx` → Already exists, add input types
- [ ] `components/ui/alert-dialog.tsx` → Already exists, verify accessibility
- [ ] `components/ui/dropdown-menu.tsx` → Already exists, add keyboard nav
- [ ] `components/ui/select.tsx` → Already exists, add search functionality
- [ ] `components/ui/switch.tsx` → Already exists, add state management

#### 2.3 Component Composition

- [ ] Create `components/layout/dashboard-layout.tsx` → Already exists, make fully reusable
- [ ] Create `components/layout/sidebar.tsx` → Extract from monitor-sidebar
- [ ] Create `components/layout/navbar.tsx` → Extract from dashboard-layout

#### 2.4 Monitor Detail Components

- [ ] Split `monitor-detail-panel.tsx` into sub-components:
  - `MonitorHeader`
  - `HeartbeatVisualization`
  - `StatsGrid`
  - `ResponseTimeChart`
  - `MonitorActions`

#### 2.5 Monitor List Components

- [ ] Split `live-monitors.tsx` into:
  - `MonitorCard` → Individual monitor card
  - `MonitorStatusIndicator` → Status badge with ping
  - `MonitorActionsMenu` → Dropdown actions

#### 2.6 Form Components

- [ ] Create reusable form components with zod validation
- [ ] Create `components/form/monitor-form.tsx` → Monitor creation/editing form
- [ ] Create `components/form/incident-form.tsx` → Incident creation form

#### 2.7 Notification Components

- [ ] Create `components/notifications/channel-config.tsx` → Per-channel config form
- [ ] Create `components/notifications/test-button.tsx` → Already exists, enhance

### Deliverables

- ✅ All UI components extracted to `components/ui/`
- ✅ Dashboard layout modularized
- ✅ Monitor detail panel split into composable components
- ✅ Monitor list uses reusable MonitorCard component
- ✅ Form components with zod validation
- ✅ Consistent styling patterns across all components

---

## Phase 3: Code Quality & Best Practices

### Objectives

- Improve type safety
- Enhance security
- Better error handling
- Performance optimizations

### Tasks

#### 3.1 Type Safety Improvements

- [ ] Ensure all Supabase queries have proper type assertions (`as unknown as never`)
- [ ] Verify all Zod schemas are complete and used
- [ ] Add missing types for notification configs
- [ ] Type-check all action functions return types

#### 3.2 Security Enhancements

- [ ] Verify SSRF protection is comprehensive
- [ ] Ensure `secureCompare` is used where needed
- [ ] Add input validation on all API routes
- [ ] Rate limit API endpoints

#### 3.3 Performance Optimizations

- [ ] Implement proper caching strategies
- [ ] Add `export const dynamic = "force-static"` where appropriate
- [ ] Optimize realtime subscriptions (debounce, limits)
- [ ] Improve initial load performance

#### 3.4 Error Handling

- [ ] Add error boundaries where needed
- [ ] Improve error messages user-friendliness
- [ ] Add loading states consistently
- [ ] Better fallback UIs

### Deliverables

- ✅ TypeScript strict mode: no errors
- ✅ All actions properly typed
- ✅ Security reviews completed
- ✅ Performance improvements documented

---

## Phase 4: Sentry Full Integration

### Objectives

- Sentry fully operational for issue tracking
- Performance monitoring
- Replay integration
- Error grouping and filtering

### Tasks

#### 4.1 Sentry Configuration Enhancement

- [ ] Set `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` example
- [ ] Configure `environment` based on `NEXT_PUBLIC_NODE_ENV`
- [ ] Set `release` tracking with git version
- [ ] Configure `integrations` properly:
  - `Sentry.replayIntegration()` for error replay
  - `Sentry.browserTracingIntegration()` for tracing
- [ ] Set proper `tracesSampler` function
- [ ] Configure `profilesSampleRate`

#### 4.2 Error Monitoring

- [ ] Set up `beforeSend` callback to enrich errors
- [ ] Configure `attachments` for screenshots on error
- [ ] Set up `debug` mode based on environment
- [ ] Add custom `errorId` tracking

#### 4.3 Performance Monitoring

- [ ] Enable browser performance monitoring
- [ ] Set up transaction name tracking
- [ ] Configure automatic instrumentation for fetch/XHR

#### 4.4 Replay Integration

- [ ] Configure replay sampling rates (session, on-error)
- [ ] Set up `replayLinks` for easy error reproduction
- [ ] Configure `maskAllText` for PII protection
- [ ] Configure `blockMouseMove` for privacy

#### 4.5 Sentry SDK Customizations

- [ ] Create `lib/sentry.ts` → Central Sentry configuration
- [ ] Add `processMonitorCheck` breadcrumbs for monitor debugging
- [ ] Add `networkError` breadcrumbs for SSRF blocked requests
- [ ] Add custom `tag` monitoring (environment, version)

### Deliverables

- ✅ Sentry initialized across all runtimes
- ✅ DSN configured in environment
- ✅ Replay integration active
- ✅ Performance monitoring enabled
- ✅ Custom breadcrumbs for monitor checks
- ✅ Error enrichment and attachments

---

## Phase 5: CI/CD & Deployment

### Objectives

- Set up GitHub Actions workflow
- Automate testing and linting
- Deploy on push to main
- Monitor deployment health

### Tasks

#### 5.1 GitHub Actions Workflow

- [ ] Create `.github/workflows/ci.yml` → CI pipeline
  - Typecheck
  - Lint
  - Test (if any)
  - Build
- [ ] Create `.github/workflows/cd.yml` → CD pipeline
  - Vercel deployment
  - Sentry release tracking
- [ ] Create `.github/workflows/pr-comment.yml` → PR comment bot

#### 5.2 Automated Testing

- [ ] Add unit tests for critical functions
- [ ] Add integration tests for Supabase queries
- [ ] Add e2e tests for key flows (monitor creation, check, notification)
- [ ] Set up Playwright test suite

#### 5.3 Deployment Automation

- [ ] Set up Vercel project hooks
- [ ] Configure automatic deploy on push
- [ ] Set up preview deployments on PR
- [ ] Configure domain if applicable

#### 5.4 Health Checks

- [ ] Set up uptime ping for the app itself
- [ ] Configure Sentry release health
- [ ] Monitor deployment errors

### Deliverables

- ✅ CI pipeline running on every push
- ✅ CD pipeline deploying to Vercel
- ✅ PR template with checklist
- ✅ Automated testing setup
- ✅ Health monitoring configured

---

## Phase 6: Final Polish

### Objectives

- User experience improvements
- Accessibility improvements
- Documentation
- Code cleanup

### Tasks

- [ ] Fix any remaining accessibility issues (a11y)
- [ ] Add missing alt text, ARIA labels
- [ ] Improve keyboard navigation
- [ ] Add responsive improvements
- [ ] Update README with new features
- [ ] Create contribution guidelines
- [ ] Changelog generation setup

### Deliverables

- ✅ Accessibility compliant (WCAG AA minimum)
- ✅ Full documentation
- ✅ Contribution guidelines
- ✅ Changelog auto-generation ready

---

## Execution Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

Each phase must complete before moving to the next. All phases should be verified before committing.
