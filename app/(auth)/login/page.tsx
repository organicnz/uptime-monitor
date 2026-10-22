"use client";

import { Activity, ArrowLeft, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { OAuthButtons } from "@/components/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COPYRIGHT_YEAR } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signupsDisabled = searchParams.get("message") === "signups-disabled";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-sm space-y-8">
      {/* Mobile Logo */}
      <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
          <Activity className="h-5 w-5 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">
          Uptime<span className="text-primary">Monitor</span>
        </span>
      </div>

      <div className="space-y-2">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to website
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">
          Enter your email to sign in to your account
        </p>
      </div>

      <OAuthButtons />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            Or continue with email
          </span>
        </div>
      </div>

      <form onSubmit={handleLogin} className="space-y-6">
        {signupsDisabled && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              New signups are currently disabled. This is a private instance.
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="h-11"
          />
        </div>

        <Button
          type="submit"
          className="h-11 w-full shadow-lg shadow-primary/20"
          size="lg"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        This is a private instance. Signups are disabled.
      </p>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center justify-center space-y-8">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left: Branding Panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-card p-12 lg:flex">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute right-[-10%] bottom-[-20%] h-[500px] w-[500px] rounded-full bg-chart-5/20 blur-[120px]" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">
            Uptime<span className="text-primary">Monitor</span>
          </span>
        </div>

        {/* Testimonial */}
        <div className="relative z-10 space-y-6">
          <blockquote className="space-y-4">
            <p className="text-2xl leading-relaxed font-medium text-foreground/90">
              &ldquo;This platform has completely transformed how we monitor our
              infrastructure. The instant alerts and status pages are a game
              changer.&rdquo;
            </p>
            <footer className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500" />
              <div>
                <p className="font-medium">Sofia Davis</p>
                <p className="text-sm text-muted-foreground">CTO at TechCorp</p>
              </div>
            </footer>
          </blockquote>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-sm text-muted-foreground">
          © {COPYRIGHT_YEAR} Uptime Monitor. All rights reserved.
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex items-center justify-center bg-background p-8">
        <Suspense fallback={<LoadingFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
