/**
 * The dashboard's loading state.
 *
 * `loading.tsx` puts a Suspense boundary around the route, so the shell
 * — the navigation, the header, the shape of the page — is painted while
 * the monitors are still being fetched, instead of the reader staring at
 * a blank page until the query comes back.
 *
 * It is a skeleton rather than a spinner because the shape is known: the
 * page is a row of statistics over a list of monitors, and a skeleton of
 * that shape is a better answer than a spinner ever is.
 */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-neutral-800/60 ${className ?? ""}`}
    />
  );
}

export default function DashboardLoading() {
  return (
    <div
      className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden"
      role="status"
      aria-label="Loading monitors"
    >
      <div className="glass-header flex items-center justify-between px-3 py-2 sm:p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>

      <div className="grid grid-cols-2 border-b border-white/5 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="border-b border-white/5 px-2 py-3 text-center last:border-r-0 sm:border-r sm:px-4 sm:py-5"
          >
            <Skeleton className="mx-auto h-3 w-20" />
            <Skeleton className="mx-auto mt-2 h-5 w-12" />
          </div>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-lg border border-white/5 bg-neutral-900/40 p-3"
          >
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
