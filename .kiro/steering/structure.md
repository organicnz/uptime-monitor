# Project Structure

```
app/                          # Next.js App Router
├── (auth)/                   # Auth route group (public)
│   ├── login/
│   └── signup/
├── (dashboard)/              # Protected dashboard route group
│   └── dashboard/
│       ├── monitors/         # Monitor CRUD pages
│       │   ├── [id]/         # Monitor detail & edit
│       │   └── new/
│       ├── notifications/    # Notification channel management
│       └── status-pages/     # Status page management
├── api/                      # API routes
│   ├── cron/check-monitors/  # Vercel cron endpoint
│   ├── notifications/        # Notification APIs
│   └── status-pages/         # Status page APIs
├── status/[slug]/            # Public status pages
└── page.tsx                  # Landing page

components/
├── ui/                       # shadcn/ui base components
└── *.tsx                     # Feature components

lib/
├── supabase/                 # Supabase client setup
│   ├── client.ts             # Browser client
│   ├── server.ts             # Server client (async)
│   └── middleware.ts         # Auth middleware helpers
├── actions/                  # Server actions
├── monitor-checker.ts        # Monitor check logic
├── notifications.ts          # Notification dispatchers
└── utils.ts                  # Shared utilities (cn helper)

types/
├── database.ts               # Supabase table types
└── application.ts            # Domain types & helpers

supabase/
└── schema.sql                # Database schema

scripts/                      # Utility scripts
```

## Route Groups

- `(auth)` - Unauthenticated pages with minimal layout
- `(dashboard)` - Authenticated pages with nav header, redirects to login if no session

## Conventions

- Page components are async server components by default
- Client components marked with `"use client"` directive
- Server actions use `"use server"` directive
- API routes use Next.js Route Handlers (`route.ts`)
- Dynamic routes use `[param]` folder naming
