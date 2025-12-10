import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { IncidentForm } from "@/components/incident-form";
import { createIncident } from "@/lib/actions/incidents";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link
            href="/dashboard/incidents"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Incidents
          </Link>
          <h1 className="text-3xl font-bold gradient-text">Report Incident</h1>
          <p className="text-muted-foreground mt-1">
            Manually report an incident for a monitored service
          </p>
        </div>

        <IncidentForm monitors={monitors} action={createIncident} />
      </div>
    </div>
  );
}
