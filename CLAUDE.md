# CLAUDE.md - AI Assistant Context

## Project Overview

**Uptime Monitor** - A self-hosted uptime monitoring application inspired by Uptime Kuma, built with Next.js 16 and Supabase.

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Deployment**: Vercel (secrets stored there)

## Project Structure

```
app/                    # Next.js App Router pages
├── (auth)/            # Auth pages (login, signup)
├── (dashboard)/       # Protected dashboard pages
├── api/               # API routes
lib/                   # Utilities and services
├── supabase/          # Supabase client configuration
├── notifications.ts   # Notification service (Telegram, Discord, Slack, Webhook)
components/            # Reusable UI components
├── ui/                # shadcn/ui components
types/                 # TypeScript type definitions
├── database.ts        # Supabase database types
supabase/              # Supabase configuration
├── schema.sql         # Database schema
```

## Key Features

- HTTP/HTTPS monitor checks
- Multiple notification channels (Telegram, Discord, Slack, Webhook)
- Public status pages
- Incident tracking

## Development Commands

```bash
npm run dev      # Start dev server (Turbopack)
npm run build    # Production build
npm run lint     # Run ESLint
```

## Environment Variables (set in Vercel)

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key

## Notes

- Uses `proxy.ts` instead of deprecated `middleware.ts` (Next.js 16)
- Database types may show as `never` - use explicit type assertions for Supabase queries
- Lefthook configured for pre-commit linting and pre-push build checks
