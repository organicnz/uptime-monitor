# Testing & Quality

## Commands

```bash
npm run lint     # ESLint
npm run build    # Type check + build
```

## Pre-commit Hooks (Lefthook)

- `pre-commit`: Runs lint
- `pre-push`: Runs build

## Type Checking

TypeScript strict mode is enabled. Common patterns:

```typescript
// Supabase returns `never` types - always cast
const monitors = (data || []) as Monitor[];

// Nullable checks
if (!user) redirect("/login");
if (error) return { error: error.message };
```

## Zod Validation

```typescript
import { z } from "zod";

const monitorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  url: z.string().url("Invalid URL"),
  interval: z.number().min(30).max(3600),
});

// In server action
const result = monitorSchema.safeParse(data);
if (!result.success) {
  return { error: result.error.errors[0].message };
}
```
