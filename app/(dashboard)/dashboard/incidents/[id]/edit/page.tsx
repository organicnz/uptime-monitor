import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteIncidentButton } from "@/components/delete-incident-button";
import { IncidentForm } from "@/components/incident-form";
import { deleteIncident, updateIncident } from "@/lib/actions/incidents";
import { createClient } from "@/lib/supabase/server";

type Monitor = {
  id: string;
  name: string;
  type: string;
};

type Incident = {
  id: string;
  monitor_id: string;
  title: string;
  content: string | null;
  status: number;
  monitors: { user_id: string } | null;
};

export default async function EditIncidentPage({
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

  // Fetch incident with monitor ownership check
  const { data: incidentData } = await supabase
    .from("incidents")
    .select("*, monitors:monitor_id(user_id)")
    .eq("id", id)
    .single();

  if (!incidentData) {
    notFound();
  }

  const incident = incidentData as Incident;

  // Verify ownership
  if (incident.monitors?.user_id !== user.id) {
    notFound();
  }

  // Fetch all monitors for the form
  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("id, name, type")
    .eq("user_id", user.id)
    .order("name");

  const monitors = (monitorsData || []) as Monitor[];

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateIncident(id, formData);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Link
              href="/dashboard/incidents"
              className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Incidents
            </Link>
            <h1 className="gradient-text text-3xl font-bold">Edit Incident</h1>
            <p className="mt-1 text-muted-foreground">
              Update incident details and status
            </p>
          </div>
          <DeleteIncidentButton id={id} action={deleteIncident} />
        </div>

        <IncidentForm
          incident={incident}
          monitors={monitors}
          action={updateAction}
        />
      </div>
    </div>
  );
}
