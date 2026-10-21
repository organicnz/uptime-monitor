"use client";

import { Loader2, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type Props = {
  onVerified?: () => void;
};

export function MFAVerify({ onVerified }: Props) {
  const router = useRouter();
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setLoading(true);
    setError("");

    const supabase = createClient();

    // Get the TOTP factor
    const { data: factorsData, error: factorsError } =
      await supabase.auth.mfa.listFactors();

    if (factorsError) {
      setError(factorsError.message);
      setLoading(false);
      return;
    }

    const totpFactor = factorsData.totp[0];

    if (!totpFactor) {
      setError("No authenticator found. Please set up 2FA first.");
      setLoading(false);
      return;
    }

    // Create challenge
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: totpFactor.id });

    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    // Verify the code
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    if (onVerified) {
      onVerified();
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && verifyCode.length === 6) {
      void handleVerify();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="code">Verification code</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              className="h-14 text-center font-mono text-2xl tracking-widest"
              autoFocus
            />
          </div>

          <Button
            onClick={handleVerify}
            disabled={loading || verifyCode.length !== 6}
            className="h-11 w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Open your authenticator app to view your verification code
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
