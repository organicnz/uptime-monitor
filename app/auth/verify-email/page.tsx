"use client";

import { Activity, CheckCircle2, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Button } from "@/components/ui/button";
import { resendVerificationEmail } from "@/lib/actions/auth";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);

    const result = await resendVerificationEmail(email);

    if (result.error) {
      setError(result.error);
    } else {
      setResent(true);
    }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/20">
        <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          We sent a verification link to{" "}
          {email && (
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              {email}
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {resent && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          Verification email resent!
        </div>
      )}

      <div className="space-y-3 pt-4">
        <Button
          onClick={handleResend}
          variant="outline"
          className="w-full"
          disabled={loading || !email}
        >
          {loading ? "Sending..." : "Resend verification email"}
        </Button>

        <Link href="/login">
          <Button variant="ghost" className="w-full">
            Back to login
          </Button>
        </Link>
      </div>

      <p className="pt-4 text-xs text-neutral-500 dark:text-neutral-400">
        Didn&apos;t receive the email? Check your spam folder or try resending.
      </p>
    </div>
  );
}

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

export default function VerifyEmailPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-neutral-900 p-12 text-white lg:flex">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500 blur-[120px]" />
          <div className="absolute right-[-10%] bottom-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500 blur-[120px]" />
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
          © {new Date().getFullYear()} Uptime Monitor Inc.
        </div>
      </div>

      {/* Right: Content */}
      <div className="flex items-center justify-center bg-white p-8 dark:bg-neutral-950">
        <Suspense fallback={<LoadingFallback />}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
