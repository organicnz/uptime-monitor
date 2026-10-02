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
├── env.ts             # Required-env accessors; fail closed
├── security.ts        # Security utilities (SSRF protection, secure compare)
├── notification-types.ts    # Which config fields are credentials
├── notification-channels.ts # Vault-backed channel CRUD (server only)
├── notifications.ts   # Notification dispatchers
├── monitor-checker.ts # Monitor check logic
components/            # Reusable UI components
├── ui/                # shadcn/ui components
types/                 # TypeScript type definitions
supabase/              # Database schema
├── schema.sql         # Reference schema
├── migrations/        # Applied in order, all idempotent
└── functions/         # Edge Functions
    ├── _shared/senders.ts  # Shared by the app and the edge runtime
    └── notification-dispatch/
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

`lib/env.ts` is the single source of truth. Read env through it, never
`process.env.X!` — the assertion suppresses the type error and turns a missing
value into a throw from inside the SDK. `.env.local.example` is the documented
list, and `__tests__/lib/vault-secrets.test.ts` fails if the two drift.

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - required
- `SUPABASE_SERVICE_ROLE_KEY` - required, server-side only
- `CRON_SECRET` - Vercel only; not read by any workflow
- `VERCEL_AUTOMATION_BYPASS_SECRET` - Vercel Deployment Protection
- `NOTIFICATION_DISPATCH_SECRET` - shared with the dispatch Edge Function;
  CI provisions the function's copy via `supabase secrets set`

## Database

- Schema in `supabase/schema.sql`
- Types in `types/database.ts`
- RLS enabled on all tables
- Service role required for heartbeat inserts

## Security Features

- Row Level Security (RLS) on all tables
- Tenant notification credentials in Supabase Vault, reachable only through
  owner-checked `SECURITY DEFINER` functions; a CHECK constraint keeps them out
  of `notification_channels.config`
- `CREATE` on the `public` schema revoked from every role
- SSRF protection for monitor URLs and outbound webhooks, in both runtimes
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
- `SUPABASE_PROJECT_REF` is a GitHub **Variable**, not a Secret: it is the
  subdomain of `https://<ref>.supabase.co` and is already public
- `migrate` and `edge-functions` declare `environment: production`; add
  required reviewers under Settings -> Environments

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

### Heartbeat Result Semantics

`lib/monitor-status.ts` is the single source of truth for how a raw check
result becomes a stored status. Change behaviour there, not in the checker.

- `HEARTBEAT_STATUS` — 0 DOWN, 1 UP, 2 PENDING, 3 MAINTENANCE, 4 DEGRADED.
  `lib/monitor-checker.ts` emits DEGRADED when a check succeeds but exceeds
  `getDegradedThresholdMs` (80% of the monitor's timeout), so it is a live
  state, not a reserved one.
- `determineEffectiveStatus` — applies the retry window. It holds the previous
  state only while that state represents health; MAINTENANCE and DEGRADED fall
  back to PENDING so a monitor that starts failing during a maintenance window
  surfaces the outage instead of staying "intentionally offline".
- `nextConsecutiveUptime` — UP increments, DOWN resets, and PENDING /
  MAINTENANCE suspend the streak (planned work must not erase uptime).
- `classifyErrorType` — derives a stable category from the human-readable
  `msg` so dashboards can group failures. Returns null for UP and
  MAINTENANCE; PENDING still classifies because it means "failed, inside the
  retry window". The existing `idx_heartbeats_error_type` index depends on
  this column being written.

Columns declared in `supabase/schema.sql` but not yet populated are marked
`RESERVED:`. Do not read them as live data.

### Notification Channel Types

`telegram`, `discord`, `slack`, `teams`, `pushover`, `webhook`, `email` (planned)

### Notification Credentials (Vault)

Channels are written server-side through `lib/notification-channels.ts`; the
browser never talks to `notification_channels` directly.

- `splitChannelConfig(type, config)` in `lib/notification-types.ts` decides what
  is a credential. `SENSITIVE_CONFIG_KEYS` must stay in lockstep with the
  backfill and the CHECK constraint in
  `supabase/migrations/20260927094500_add_vault_notification_secrets.sql`.
- The server splits again on write, so a client that puts a credential in
  `config` still cannot get it stored there.
- Reads go through the `notification_channel_secret` /
  `notification_channel_secrets` RPCs. An update's `secret` is **partial**:
  an omitted key keeps the stored credential.
- `resolveChannelConfigs()` batches a fan-out into one vault read.
- `supabase/functions/_shared/senders.ts` must stay runtime-agnostic: no
  `node:*` imports, no `Deno.*`, no `process.env`. Each caller injects its own
  `NotificationTransport`, which is where its egress policy lives.
