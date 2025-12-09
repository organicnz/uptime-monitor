# Status Pages

## Public Route

`app/status/[slug]/page.tsx` - Public status page (no auth required)

## Data Model

```typescript
type StatusPage = {
  id: string;
  user_id: string;
  slug: string; // URL slug (unique)
  title: string;
  description: string | null;
  theme: "auto" | "light" | "dark";
  custom_domain: string | null;
  is_public: boolean;
  google_analytics_id: string | null;
};

// Junction table links pages to monitors
type StatusPageMonitor = {
  status_page_id: string;
  monitor_id: string;
  display_order: number;
};
```

## Fetching Status Page Data

```typescript
// Get status page with monitors
const { data: statusPage } = await supabase
  .from("status_pages")
  .select(
    `
    *,
    status_page_monitors(
      display_order,
      monitors(*)
    )
  `,
  )
  .eq("slug", slug)
  .eq("is_public", true)
  .single();
```

## Public API

```typescript
// app/api/status-pages/[slug]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Fetch public status page data (no auth)
}
```

## Theme Support

Status pages support `auto`, `light`, `dark` themes:

```tsx
<div className={cn(
  "min-h-screen",
  theme === "dark" && "dark bg-neutral-950",
  theme === "light" && "bg-white",
  theme === "auto" && "dark:bg-neutral-950"
)}>
```
