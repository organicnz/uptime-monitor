# CLAUDE.md - AI Assistant Context

## Project Overview

**Uptime Monitor** - A self-hosted uptime monitoring application inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), built with Next.js and Supabase.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, Turbopack)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode)
- **Deployment**: Vercel

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
├── security.ts        # Security utilities (SSRF protection, secure compare)
├── notifications.ts   # Notification dispatchers
├── monitor-checker.ts # Monitor check logic
components/            # Reusable UI components
├── ui/                # shadcn/ui components
types/                 # TypeScript type definitions
supabase/              # Database schema
```

## Key Features

- **Monitor Types**: HTTP/HTTPS, TCP, Ping, DNS, Keyword
- **Notifications**: Telegram, Discord, Slack, Teams, Pushover, Webhooks
- **Status Pages**: Public dashboards with custom slugs
- **Incident Tracking**: Automatic incident creation/resolution
- **MFA Support**: TOTP-based two-factor authentication

## Development Commands

```bash
npm run dev      # Start dev server on port 3001 (Turbopack)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Variables

See `.env.local.example` for all required variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `CRON_SECRET` - Secret for cron job authentication

## Database

- Schema in `supabase/schema.sql`
- Types in `types/database.ts`
- RLS enabled on all tables
- Service role required for heartbeat inserts

## Security Features

- Row Level Security (RLS) on all tables
- SSRF protection for monitor URLs
- Rate limiting on auth endpoints
- Constant-time token comparison
- Strong password requirements (8+ chars, mixed case, numbers)
- Security headers (HSTS, CSP, X-Frame-Options)
- Input validation with Zod

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
