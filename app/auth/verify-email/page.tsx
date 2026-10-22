import { Activity, Loader2 } from "lucide-react";
import { Suspense } from "react";

import { VerifyEmailContent } from "@/components/verify-email-content";
import { COPYRIGHT_YEAR } from "@/lib/constants";

function LoadingFallback() {
  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
      <p className="text-neutral-500">Loading...</p>
    </div>
  );
}

/**
 * The part of the page that needs the URL.
 *
 * The address the reader arrived at carries the email they were sent a
 * link for. That is runtime data — the framework cannot know it when
 * the page is built — so it is read here, inside the boundary, and
 * handed to the part that shows it.
 */
async function VerifyEmailPanel({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return <VerifyEmailContent email={email ?? ""} />;
}

/**
 * The page is a server component; the part that needs the URL is not.
 *
 * The address the reader arrived at carries the email they were sent a
 * link for, and a URL is runtime data — the framework cannot know it
 * when the page is built. So the part that reads it sits behind a
 * boundary the server owns, and the part that does not — the branding,
 * the frame, the footer — is prerendered and paints straight away.
 *
 * The boundary has to be here rather than inside the client component:
 * a boundary that lives inside a client component is drawn after the
 * shell has been decided, so it cannot be the boundary that lets the
 * shell be prerendered.
 */
export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-neutral-900 p-12 text-white lg:flex">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500 blur-[120px]" />
          <div className="absolute top-[-10%] right-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500 blur-[120px]" />
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-400" />
          <span className="text-xl font-bold tracking-tight">
            Uptime Monitor
          </span>
        </div>

        <div className="relative z-10">
          <blockquote className="space-y-2">
            <p className="text-2xl leading-relaxed font-medium">
              &ldquo;One more step to go! Verify your email and start monitoring
              your services.&rdquo;
            </p>
            <footer className="text-neutral-400">Uptime Monitor Team</footer>
          </blockquote>
        </div>

        <div className="relative z-10 text-sm text-neutral-500">
          © {COPYRIGHT_YEAR} Uptime Monitor Inc.
        </div>
      </div>

      {/* Right: Content */}
      <div className="flex items-center justify-center bg-white p-8 dark:bg-neutral-950">
        <Suspense fallback={<LoadingFallback />}>
          <VerifyEmailPanel searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
