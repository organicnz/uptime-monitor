import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { IncidentForm } from "@/components/incident-form";
import { createIncident } from "@/lib/actions/incidents";
import { createClient } from "@/lib/supabase/server";

type Monitor = {
  id: string;
  name: string;
  type: string;
};

export default async function NewIncidentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: monitorsData } = await supabase
    .from("monitors")
    .select("id, name, type")
    .eq("user_id", user.id)
    .order("name");

  const monitors = (monitorsData || []) as Monitor[];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/dashboard/incidents"
            className="mb-4 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Incidents
          </Link>
          <h1 className="gradient-text text-3xl font-bold">Report Incident</h1>
          <p className="mt-1 text-muted-foreground">
            Manually report an incident for a monitored service
          </p>
        </div>

        <IncidentForm monitors={monitors} action={createIncident} />
      </div>
    </div>
  );
}
