import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccountSettings } from "@/components/account-settings";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string;
};

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          Manage your account settings and preferences
        </p>
      </div>

      <AccountSettings
        user={{
          id: user.id,
          email: user.email || "",
          fullName: profile?.full_name || user.user_metadata?.full_name || "",
          avatarUrl:
            profile?.avatar_url || user.user_metadata?.avatar_url || "",
          provider: user.app_metadata?.provider || "email",
        }}
      />
    </div>
  );
}
