import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { MaintenanceForm } from "@/components/maintenance-form";
import {
  updateMaintenance,
  deleteMaintenance,
} from "@/lib/actions/maintenance";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeleteMaintenanceButton } from "@/components/delete-maintenance-button";

type Monitor = {
  id: string;
  name: string;
  type: string;
  active: boolean;
};

type Maintenance = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  strategy: string | null;
};

export default async function EditMaintenancePage({
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

  // Fetch maintenance
  const { data: maintenanceData } = await supabase
    .from("maintenance")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!maintenanceData) {
    notFound();
  }

  const maintenance = maintenanceData as Maintenance;

  // Fetch all monitors for assignment
  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("id, name, type, active")
    .eq("user_id", user.id)
    .order("name");

  const monitors = (monitorsData || []) as Monitor[];

  // Fetch assigned monitors
  const { data: assignedData } = await supabase
    .from("maintenance_monitors")
    .select("monitor_id")
    .eq("maintenance_id", id);

  const assignedMonitorIds = (assignedData || []).map(
    (a: { monitor_id: string }) => a.monitor_id,
  );

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateMaintenance(id, formData);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href="/dashboard/maintenance"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Maintenance
            </Link>
            <h1 className="text-3xl font-bold gradient-text">
              Edit Maintenance
            </h1>
            <p className="text-muted-foreground mt-1">
              Update the maintenance window details
            </p>
          </div>
          <DeleteMaintenanceButton id={id} action={deleteMaintenance} />
        </div>

        <MaintenanceForm
          maintenance={maintenance}
          monitors={monitors}
          assignedMonitorIds={assignedMonitorIds}
          action={updateAction}
        />
      </div>
    </div>
  );
}
