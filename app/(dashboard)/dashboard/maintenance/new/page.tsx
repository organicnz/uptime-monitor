import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MaintenanceForm } from "@/components/maintenance-form";
import { createMaintenance } from "@/lib/actions/maintenance";
import { createClient } from "@/lib/supabase/server";

type Monitor = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

export default async function NewMaintenancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all monitors for assignment
  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("id, name, type, active")
    .eq("user_id", user.id)
    .order("name");

  const monitors = (monitorsData || []) as Monitor[];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/dashboard/maintenance"
            className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Maintenance
          </Link>
          <h1 className="gradient-text text-3xl font-bold">
            Schedule Maintenance
          </h1>
          <p className="mt-1 text-muted-foreground">
            Create a new maintenance window to pause monitoring alerts
          </p>
        </div>

        <MaintenanceForm monitors={monitors} action={createMaintenance} />
      </div>
    </div>
  );
}
