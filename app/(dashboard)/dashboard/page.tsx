import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  type Monitor = {
    id: string;
    user_id: string;
    name: string;
    url: string | null;
    hostname: string | null;
    method: string | null;
    active: boolean;
    type: string;
    interval: number;
    created_at: string;
    updated_at: string;
  };

  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const monitors = (monitorsData || []) as Monitor[];

  return <DashboardLayout monitors={monitors} />;
}
