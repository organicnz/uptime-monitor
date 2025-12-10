"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, ShieldCheck, ShieldOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MFAEnroll } from "./mfa-enroll";

type Factor = {
  id: string;
  friendly_name: string | null;
  factor_type: string;
  status: string;
  created_at: string;
};

export function MFASettings() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const allFactors = [
      ...(data.totp || []),
      ...(data.phone || []),
    ] as Factor[];
    setFactors(allFactors.filter((f) => f.status === "verified"));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    loadFactors();
  }, [loadFactors]);

  const handleUnenroll = async (factorId: string) => {
    setRemoving(factorId);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });

    if (error) {
      toast.error(error.message);
      setRemoving(null);
      return;
    }

    toast.success("Two-factor authentication disabled");
    await loadFactors();
    setRemoving(null);
  };

  const handleEnrolled = async () => {
    setShowEnroll(false);
    await loadFactors();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (showEnroll) {
    return (
      <MFAEnroll
        onEnrolled={handleEnrolled}
        onCancelled={() => setShowEnroll(false)}
      />
    );
  }

  const hasMFA = factors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Add an extra layer of security to your account using an authenticator
          app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasMFA ? (
          <>
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              <div className="flex-1">
                <p className="font-medium text-green-500">2FA is enabled</p>
                <p className="text-sm text-muted-foreground">
                  Your account is protected with two-factor authentication
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Enrolled factors</p>
              {factors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {factor.friendly_name || "Authenticator App"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(factor.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={removing === factor.id}
                      >
                        {removing === factor.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Disable 2FA?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove two-factor authentication from your
                          account. Your account will be less secure.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleUnenroll(factor.id)}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Disable 2FA
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <ShieldOff className="h-5 w-5 text-amber-500" />
              <div className="flex-1">
                <p className="font-medium text-amber-500">2FA is not enabled</p>
                <p className="text-sm text-muted-foreground">
                  Enable two-factor authentication for enhanced security
                </p>
              </div>
            </div>

            <Button onClick={() => setShowEnroll(true)} className="w-full">
              <Shield className="mr-2 h-4 w-4" />
              Enable Two-Factor Authentication
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
