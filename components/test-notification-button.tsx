"use client";

import { Loader2, TestTube } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { fetchJson, NotificationTestResponseSchema } from "@/lib/api-client";

interface TestNotificationButtonProps {
  channelId: string;
}

export function TestNotificationButton({
  channelId,
}: TestNotificationButtonProps) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      await fetchJson(
        "/api/notifications/test",
        NotificationTestResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId }),
        },
      );
      toast.success("Test notification sent!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send test notification",
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      onClick={handleTest}
      disabled={testing}
    >
      {testing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <TestTube className="h-4 w-4" />
      )}
    </Button>
  );
}
