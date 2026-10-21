import { AlertCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-8 dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
          <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Authentication Error
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            Something went wrong during authentication. The link may have
            expired or already been used.
          </p>
        </div>
        <div className="space-y-3">
          <Link href="/login">
            <Button className="w-full">Back to login</Button>
          </Link>
          <Link href="/forgot-password">
            <Button variant="outline" className="w-full">
              Request new reset link
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
