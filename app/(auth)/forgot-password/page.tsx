"use client";

import { Activity, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPYRIGHT_YEAR } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

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
              &ldquo;Security and reliability are at the core of everything we
              do. Your account is always protected.&rdquo;
            </p>
            <footer className="text-neutral-400">
              Security Team, Uptime Monitor
            </footer>
          </blockquote>
        </div>

        <div className="relative z-10 text-sm text-neutral-500">
          © {COPYRIGHT_YEAR} Uptime Monitor Inc.
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex items-center justify-center bg-white p-8 dark:bg-neutral-950">
        <div className="w-full max-w-sm space-y-8">
          {success ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Check your email
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400">
                  We sent a password reset link to{" "}
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {email}
                  </span>
                </p>
              </div>
              <Link href="/login">
                <Button variant="outline" className="h-11 w-full">
                  Back to login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-center lg:text-left">
                <Link
                  href="/login"
                  className="mb-4 inline-flex items-center text-sm text-neutral-500 transition-colors hover:text-neutral-900 dark:hover:text-neutral-100"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to login
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">
                  Forgot password?
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400">
                  Enter your email and we&apos;ll send you a reset link
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>

              <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-blue-600 hover:text-blue-500"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
