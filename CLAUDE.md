# CLAUDE.md - AI Assistant Context

This file provides context for AI assistants (Claude Code, Kiro, etc.) working with this codebase.

## Project Overview

**Uptime Monitor** - A self-hosted uptime monitoring application inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), built with Next.js and Supabase.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, Turbopack)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode)
- **Deployment**: Vercel

## Quick Reference

```bash
# Development
npm run dev      # Start dev server on port 3001 (Turbopack)
npm run build    # Production build
npm run lint     # Run ESLint

# Database
# Schema: supabase/schema.sql
# Types: types/database.ts

# Rust Tools
npm run build:audit      # Build the audit binary
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

# Rust Tools
npm run build:audit                        # Build audit tool
./tools/audit/target/release/audit generate-favicons  # Generate favicons
./tools/audit/target/release/audit local-cron         # Run local monitor check
./tools/audit/target/release/audit vercel-cleanup     # Cleanup deployments
```

## Environment Variables

See `.env.local.example` for all required variables:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side only)
- `CRON_SECRET` - Secret for cron job authentication
- `VERCEL_AUTOMATION_BYPASS_SECRET` - Bypass secret for Vercel Authentication (QStash/Tests)

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

---

## Claude Code Skills

### Supabase Query Pattern

Always use explicit type assertions for Supabase queries (types may return `never`):

```typescript
// Server component
import { createClient } from "@/lib/supabase/server";

type Monitor = { id: string; name: string /* ... */ };

const supabase = await createClient(); // async on server!
const { data } = await supabase
  .from("monitors")
  .select("*")
  .eq("user_id", user.id);
const monitors = (data || []) as Monitor[];

// For inserts, cast to never
const { data, error } = await supabase
  .from("monitors")
  .insert([monitorData] as unknown as never)
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
import { CheckCircle2, XCircle, AlertCircle, Plus, Trash2 } from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Toast notifications
import { toast } from "sonner";
```

### Monitor Types

Supported: `http`, `tcp`, `ping`, `keyword`, `dns`
Schema supports (not implemented): `docker`, `steam`

### Notification Channel Types

`telegram`, `discord`, `slack`, `teams`, `pushover`, `webhook`, `email` (planned)
