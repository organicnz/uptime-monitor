# Security Patterns

## Authentication Check

```typescript
const supabase = await createClient();
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) redirect("/login");
```

## Row Level Security

All tables have RLS. Users only access their own data:

```sql
-- Policy pattern
CREATE POLICY "Users can view own data" ON table_name
FOR SELECT USING ((select auth.uid()) = user_id);
```

## SSRF Protection

Monitor URLs are validated in `lib/security.ts`:

```typescript
import { isUrlSafe } from "@/lib/security";

if (!isUrlSafe(url)) {
  return { error: "Invalid URL" };
}
```

## Cron Authentication

```typescript
// Verify cron secret
const authHeader = request.headers.get("authorization");
if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

## Service Role (Bypass RLS)

Only use for system operations like heartbeat inserts:

```typescript
import { createServiceClient } from "@/lib/supabase/service";
const supabase = createServiceClient();
// This bypasses RLS - use carefully!
```

## Input Validation

Always validate with Zod before database operations.

## Environment Variables

Never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Only `NEXT_PUBLIC_*` vars are safe for client.
