import { redirect } from "next/navigation";

import { AccountSettings } from "@/components/account-settings";
import { CronSettings } from "@/components/cron-settings";
import { createClient } from "@/lib/supabase/server";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
};

/**
 * A string out of a bag of account metadata.
 *
 * Supabase types `user_metadata` and `app_metadata` as `any`, because
 * what an identity provider puts in them is not known at compile time.
 * Reading a field out of one is therefore an `any` too, and an `any` that
 * lands in a form is an `any` that renders as `[object Object]`.
 */
function metadataString(metadata: unknown, key: string): string {
  if (typeof metadata !== "object" || metadata === null) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = data as Profile | null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-neutral-500 dark:text-neutral-400">
            Manage your account and monitoring settings
          </p>
        </div>

        <AccountSettings
          user={{
            id: user.id,
            email: user.email || "",
            fullName:
              profile?.full_name ||
              metadataString(user.user_metadata, "full_name"),
            avatarUrl:
              profile?.avatar_url ||
              metadataString(user.user_metadata, "avatar_url"),
            provider: metadataString(user.app_metadata, "provider") || "email",
          }}
        />

        <CronSettings />
      </div>
    </div>
  );
}
