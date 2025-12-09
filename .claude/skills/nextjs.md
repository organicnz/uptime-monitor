# Next.js Patterns

## Server vs Client Components

```typescript
// Server component (default) - can be async
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // fetch data, render
}

// Client component - needs directive
("use client");
import { useState } from "react";
export function MyComponent() {
  const [state, setState] = useState();
  // ...
}
```

## Server Actions

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createMonitor(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // validate with zod, insert data

  revalidatePath("/dashboard/monitors");
  redirect("/dashboard/monitors");
}
```

## Route Groups

- `(auth)` - Unauthenticated pages with minimal layout
- `(dashboard)` - Authenticated pages with nav header, redirects to login if no session

## API Routes

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.json({ data: "value" });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

## Middleware

This project uses `proxy.ts` for middleware (Next.js 16 pattern).
