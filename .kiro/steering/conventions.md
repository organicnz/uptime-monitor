# Code Conventions

## TypeScript

- Use explicit type assertions for Supabase queries (types may return `never`)
- Define local types inline for page-specific data shapes
- Use `@/` path alias for all imports
- Prefer `type` over `interface` for object shapes

```typescript
// Supabase query pattern
type Monitor = {
  id: string;
  name: string;
  // ...fields
};

const { data } = await supabase.from("monitors").select("*");
const monitors = (data || []) as Monitor[];
```

## React Components

- Server components are default (async functions)
- Client components require `"use client"` directive at top
- Server actions require `"use server"` directive
- Use `sonner` toast for user feedback
- Use `lucide-react` for icons

## Forms

- Client-side forms: `useState` + `onChange` handlers + direct Supabase calls
- Server actions: `FormData` + zod validation + `revalidatePath` + `redirect`
- Use shadcn/ui form components from `components/ui/`

## Styling

- Tailwind CSS with dark mode as default (`dark:` variants)
- Color palette: neutral-_ for grays, green-_ for success/primary, red-\* for errors
- Use `cn()` utility from `lib/utils` for conditional classes
- Card backgrounds: `bg-neutral-900/50 border-neutral-800`

## Error Handling

- Display errors in colored alert boxes with icons
- Use try/catch in client components
- Return `{ error: string }` from server actions

## Data Fetching

- Server components: Direct Supabase queries with `await createClient()`
- Client components: Use hooks or direct client calls
- Always check `user` auth before queries
- Redirect to `/login` if unauthenticated
