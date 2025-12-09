import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatusPageForm } from "@/components/status-page-form";

import { Monitor } from "@/types/application";

export default async function NewStatusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch active monitors for selection
  const { data: rawMonitors } = await supabase
    .from("monitors")
    .select("id, name, type")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("name");

  const monitors = (rawMonitors || []) as unknown as Monitor[];

  return (
    <div className="max-w-5xl mx-auto">
      <StatusPageForm monitors={monitors || []} />
    </div>
  );
}
