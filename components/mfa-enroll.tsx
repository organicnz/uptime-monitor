"use client";

import { Check, CheckCircle2, Copy, Loader2, Shield } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  onEnrolled: () => void;
  onCancelled: () => void;
};

export function MFAEnroll({ onEnrolled, onCancelled }: Props) {
  const [factorId, setFactorId] = useState("");
  const [qr, setQR] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const enroll = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setFactorId(data.id);
      setQR(data.totp.qr_code);
      setSecret(data.totp.secret);
      setLoading(false);
    };

    void enroll();
  }, []);

  const handleCopySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    setVerifying(true);
    setError("");

    const supabase = createClient();

    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: verifyCode,
    });

    if (verifyError) {
      setError(verifyError.message);
      setVerifying(false);
      return;
    }

    toast.success("Two-factor authentication enabled!");
    onEnrolled();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Set up two-factor authentication
        </CardTitle>
        <CardDescription>
          Scan the QR code with your authenticator app (Google Authenticator,
          Authy, 1Password, etc.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="rounded-xl bg-white p-4">
            <Image src={qr} alt="QR Code" width={192} height={192} />
          </div>
        </div>

        {/* Manual entry */}
        <div className="space-y-2">
          <p className="text-center text-sm text-muted-foreground">
            Can&apos;t scan? Enter this code manually:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-muted px-3 py-2 font-mono text-sm break-all">
              {secret}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopySecret}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Verification */}
        <div className="space-y-2">
          <Label htmlFor="verifyCode">
            Enter the 6-digit code from your app
          </Label>
          <Input
            id="verifyCode"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
            className="text-center font-mono text-2xl tracking-widest"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancelled}
            disabled={verifying}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleVerify}
            disabled={verifying || verifyCode.length !== 6}
            className="flex-1"
          >
            {verifying ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Enable 2FA
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
