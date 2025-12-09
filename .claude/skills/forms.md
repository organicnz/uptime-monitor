# Form Patterns

## Client-Side Form (useState)

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function MonitorForm() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("monitors")
      .insert([{ name }] as unknown as never);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Monitor created");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Create"}
      </Button>
    </form>
  );
}
```

## Server Action Form

```tsx
// lib/actions/monitors.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
});

export async function createMonitor(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const result = schema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
  });

  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  const { error } = await supabase
    .from("monitors")
    .insert([{ ...result.data, user_id: user.id }] as unknown as never);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/monitors");
  redirect("/dashboard/monitors");
}
```

## Error Display

```tsx
{
  error && (
    <div className="p-3 rounded-md bg-red-500/20 text-red-400 flex items-center gap-2">
      <AlertCircle className="h-4 w-4" />
      {error}
    </div>
  );
}
```
