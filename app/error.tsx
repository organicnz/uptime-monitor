"use client";

import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The root error boundary.
 *
 * Without one, a failed query — a database that is briefly unreachable, a
 * monitor whose row has a shape the page did not expect — takes the whole
 * application down and the reader is left with the browser's error page.
 * With one, the failure is contained to the part that failed, and the
 * reader can try again.
 *
 * The message is Next's own, which in production is a generic one: the
 * detail is in the digest, and the digest is what a server-side log
 * carries. Nothing here reaches for `error.stack`.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server-side log is where the detail belongs; the browser gets
    // the digest.
    console.error("[app] a route failed to render", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-neutral-100">
            Something went wrong
          </h1>
          <p className="text-sm text-neutral-400">
            {error.message || "This page could not be loaded."}
          </p>
        </div>

        {error.digest ? (
          <p className="font-mono text-xs text-neutral-600">
            Reference: {error.digest}
          </p>
        ) : null}

        <div className="flex justify-center gap-3">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">
              <Home className="h-4 w-4" />
              Go home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
