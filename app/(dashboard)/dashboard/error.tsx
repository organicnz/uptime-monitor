"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The dashboard's error boundary.
 *
 * The root boundary catches a failure too, but it replaces the whole
 * application with a full-screen message — the reader loses the
 * navigation, and the only way back is the browser's back button or a
 * fresh load. This one is closer to the failure: the layout above it
 * stays, so the reader keeps the header and the navigation, and the
 * part that failed is the part that says so.
 *
 * The message is Next's own, which in production is a generic one: the
 * detail is in the digest, and the digest is what a server-side log
 * carries. Nothing here reaches for `error.stack`.
 */
export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server-side log is where the detail belongs; the browser gets
    // the digest.
    console.error("[dashboard] a page failed to render", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-neutral-100">
            This page could not be loaded
          </h2>
          <p className="text-sm text-neutral-400">
            {error.message || "Something went wrong."}
          </p>
        </div>

        {error.digest ? (
          <p className="font-mono text-xs text-neutral-600">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="flex justify-center">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
