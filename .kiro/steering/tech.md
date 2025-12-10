# Tech Stack

## Core Technologies

- **Framework**: Next.js 16 (App Router, React 19, Turbopack)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Deployment**: Vercel

## Key Libraries

- `@supabase/ssr` - Server-side Supabase client
- `react-hook-form` + `zod` - Form handling and validation
- `recharts` - Data visualization
- `lucide-react` - Icons
- `sonner` - Toast notifications
- `date-fns` - Date formatting
- `class-variance-authority` + `tailwind-merge` - Component styling (shadcn/ui pattern)

## Development Tools

- ESLint for linting
- Lefthook for git hooks (pre-commit lint, pre-push build)
- Trunk for code quality checks
- Rust Audit Tool (`tools/audit`) for automated checks and tasks

## Commands

```bash
npm run dev      # Start dev server on port 3001 (Turbopack)
npm run build    # Production build
npm run lint     # Run ESLint

# Rust Tools
npm run build:audit      # Build audit binary
tools/audit/target/release/audit --help  # Show help
```

## Environment Variables

Required in `.env.local` or Vercel:

- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `CRON_SECRET` - Secret for authenticating cron job requests
- `VERCEL_AUTOMATION_BYPASS_SECRET` - Secret for bypassing Vercel Authentication

## Database

- Schema defined in `supabase/schema.sql`
- Types in `types/database.ts` (manual, mirrors schema)
- Row Level Security (RLS) enabled on all tables
- Service role required for heartbeat inserts (bypasses RLS)

## Patterns

- Use `@/` path alias for imports
- Supabase clients: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server)
- UI components follow shadcn/ui conventions in `components/ui/`
- Use explicit type assertions for Supabase queries (types may show as `never`)
