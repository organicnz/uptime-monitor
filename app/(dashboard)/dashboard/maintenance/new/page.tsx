import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MaintenanceForm } from "@/components/maintenance-form";
import { createMaintenance } from "@/lib/actions/maintenance";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link
            href="/dashboard/maintenance"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Maintenance
          </Link>
          <h1 className="text-3xl font-bold gradient-text">
            Schedule Maintenance
          </h1>
          <p className="text-muted-foreground mt-1">
            Create a new maintenance window to pause monitoring alerts
          </p>
        </div>

        <MaintenanceForm monitors={monitors} action={createMaintenance} />
      </div>
    </div>
  );
}
