import { Compass, Home } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The 404 page.
 *
 * `notFound()` is called from the status pages and from the dashboard's
 * routes, and without this the reader gets Next's default page: an
 * unstyled paragraph on a white background, in an application that is
 * otherwise dark.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-neutral-800">
          <Compass className="h-6 w-6 text-neutral-400" />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-sm text-green-400">404</p>
          <h1 className="text-xl font-semibold text-neutral-100">
            There is nothing here
          </h1>
          <p className="text-sm text-neutral-400">
            The page you asked for does not exist. It may have moved, or the
            link that brought you here may be out of date.
          </p>
        </div>

        <div className="flex justify-center">
          <Button asChild>
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
