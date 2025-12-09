"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TestTube, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Test notification sent!");
      } else {
        toast.error(data.error || "Failed to send test notification");
      }
    } catch {
      toast.error("Failed to send test notification");
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
