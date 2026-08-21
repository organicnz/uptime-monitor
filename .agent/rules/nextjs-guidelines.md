---
trigger: always_on
---

# Next.js 16 & React 19 Guidelines

## Core Principles

1. **Server First:** Default to React Server Components (RSC). Only use `'use client'` when interactivity, browser APIs, or React lifecycle hooks (useState, useEffect) are strictly required.
2. **Server Actions for Mutations:** Handle data mutations securely on the server using Server Actions instead of traditional API routes.
3. **Data Fetching:** Fetch data directly in Server Components using async/await. Do NOT use `useEffect` for data fetching.

## React 19 Best Practices

- **Forms:** Use the new React 19 `useActionState` and `useFormStatus` hooks for handling form submissions and loading states with Server Actions.
- **Optimistic UI:** Utilize the `useOptimistic` hook for immediate UI feedback during async mutations.
- **Promises:** Use the `use()` hook to read promises or context dynamically if needed.

## Performance & Caching

- **Turbopack:** Be mindful of Turbopack compatibility in development.
- **Caching Directives:** Understand and properly use Next.js caching behaviors (`unstable_cache`, `revalidateTag`, `revalidatePath`) to ensure fresh data delivery without compromising performance.
