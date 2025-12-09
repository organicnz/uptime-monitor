# Supabase Patterns

## Client Setup

```typescript
// Server components/actions (async!)
import { createClient } from "@/lib/supabase/server";
const supabase = await createClient();

// Client components (sync)
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

## Query Pattern with Type Assertions

Database types often show as `never`. Always use explicit type assertions:

```typescript
type Monitor = { id: string; name: string /* ... */ };

const { data } = await supabase
  .from("monitors")
  .select("*")
  .eq("user_id", user.id);
const monitors = (data || []) as Monitor[];
```

## Insert Pattern

```typescript
const { data, error } = await supabase
  .from("monitors")
  .insert([monitorData] as unknown as never)
  .select()
  .single();
```

## Authentication

```typescript
const {
  data: { user },
} = await supabase.auth.getUser();
if (!user) redirect("/login");
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

## RLS Notes

- All tables have RLS enabled
- Users can only access their own data (`user_id = auth.uid()`)
- Heartbeat inserts require service role (cron job uses `CRON_SECRET`)
