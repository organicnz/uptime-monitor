# Supabase Patterns

## Client Setup

```typescript
// Server components/actions (lib/supabase/server.ts)
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient(); // async!

// Client components (lib/supabase/client.ts)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient(); // sync
```

## Authentication

```typescript
// Get current user
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) redirect("/login");

// Sign out (server action)
await supabase.auth.signOut();
```

## Queries with Type Assertions

Database types often show as `never`. Use explicit type assertions:

```typescript
type Monitor = { id: string; name: string /* ... */ };

const { data, error } = await supabase
  .from("monitors")
  .select("*")
  .eq("user_id", user.id);

const monitors = (data || []) as Monitor[];
```

## Inserts

```typescript
// Cast to `never` for insert operations
const { data, error } = await supabase
  .from("monitors")
  .insert([monitorData] as unknown as never)
  .select()
  .single();
```

## Realtime Subscriptions

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

## Row Level Security

- All tables have RLS enabled
- Users can only access their own data (`user_id = auth.uid()`)
- Heartbeat inserts require service role (cron job uses `CRON_SECRET`)
