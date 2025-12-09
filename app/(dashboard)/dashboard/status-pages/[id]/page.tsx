import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { StatusPageForm } from "@/components/status-page-form";

import { StatusPage } from "@/types/application";

export default async function EditStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch Status Page
  const { data: statusPage, error: pageError } = await supabase
    .from("status_pages")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  // Explicit check to narrow type
  if (!statusPage || pageError) {
    notFound();
  }

  // Cast to defined type since Supabase types might be loosely defined in this context
  const typedStatusPage = statusPage as unknown as StatusPage;

  // 2. Fetch Linked Monitors
  const { data: linkedMonitors } = await supabase
    .from("status_page_monitors")
    .select("monitor_id")
    .eq("status_page_id", id);

  // 3. Fetch All Active Monitors (for selection)
  const { data: allMonitors } = await supabase
    .from("monitors")
    .select("id, name, type")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("name");

  // Format initial data
  const initialData = {
    id: typedStatusPage.id,
    title: typedStatusPage.title,
    slug: typedStatusPage.slug,
    description: typedStatusPage.description,
    is_public: typedStatusPage.is_public,
    monitors: linkedMonitors || [],
  };

  return (
    <div className="max-w-5xl mx-auto">
      <StatusPageForm monitors={allMonitors || []} initialData={initialData} />
    </div>
  );
}
