---
trigger: always_on
---

# Monitoring & Error Handling Rules

## Next.js (App Router) & Server Actions

- **Graceful Error Handling:** Never throw unhandled exceptions in Server Actions. Always use `try/catch` blocks and return structured error responses (e.g., `{ error: string, details?: any }`) to the client.
- **Server-Side Logging:** Log critical errors in Server Actions and API routes with sufficient context (user ID, action name, timestamp) for easier debugging in Vercel logs.
- **Error Boundaries:** Utilize `error.tsx` and `global-error.tsx` at strategic route levels to catch rendering errors and prevent full application crashes.

## Supabase (Database & Auth)

- **Sanitize Error Messages:** Never leak raw Supabase Postgres error messages (e.g., duplicate key, RLS violation) to the frontend. Catch these and map them to user-friendly messages.
- **Log RLS Failures:** Pay special attention to tracking and logging Row Level Security (RLS) failures, as they often indicate bugs in state management or malicious attempts.

## Vercel Analytics

- **Custom Events:** Track key user flows and critical app interactions (e.g., monitor creation, downtime alerts triggered) using `@vercel/analytics` custom events.
- **Performance Monitoring:** Ensure Vercel Web Vitals are enabled and monitored for Next.js specific metrics (LCP, FCP).

## Upstash QStash (Background Jobs)

- **Idempotency & Retries:** Design all QStash webhook endpoints to be idempotent. QStash will retry on failure; ensure that partial executions do not corrupt data.
- **Dead-Letter Logging:** Monitor failed QStash messages. Add explicit logging inside webhook handlers if a task is definitively failing after retries.

## Client-Side UX (Sonner & Hook Form)

- **Toast Notifications:** Use `sonner` to display actionable, clear error toasts when mutations or form submissions fail. Avoid generic "An error occurred" when a specific reason is known.
- **Form Validation:** Use `zod` for strict schema validation on the client (via `@hookform/resolvers`) and reuse the identical schema on the server to prevent malformed data from causing backend errors.
