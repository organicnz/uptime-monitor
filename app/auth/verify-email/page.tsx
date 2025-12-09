"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity, Mail, CheckCircle2, Loader2 } from "lucide-react";
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
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {resent && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 px-4 py-3 rounded-md text-sm flex items-center justify-center gap-2">
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

      <p className="text-xs text-neutral-500 dark:text-neutral-400 pt-4">
        Didn&apos;t receive the email? Check your spam folder or try resending.
      </p>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="w-full max-w-sm space-y-6 text-center">
      <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
      </div>
      <p className="text-neutral-500">Loading...</p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-neutral-900 p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-500 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-400" />
          <span className="font-bold text-xl tracking-tight">
            Uptime Monitor
          </span>
        </div>

        <div className="relative z-10">
          <blockquote className="space-y-2">
            <p className="text-2xl font-medium leading-relaxed">
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
      <div className="flex items-center justify-center p-8 bg-white dark:bg-neutral-950">
        <Suspense fallback={<LoadingFallback />}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
