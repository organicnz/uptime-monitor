"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  CheckCircle2,
  Search,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateIncidentStatus } from "@/lib/actions/incidents";
import Link from "next/link";

type Incident = {
  id: string;
  status: number;
};

export function IncidentQuickActions({ incident }: { incident: Incident }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: number) => {
    startTransition(async () => {
      const result = await updateIncidentStatus(incident.id, newStatus);
      if (result.success) {
        const statusLabels = ["Open", "Resolved", "Investigating"];
        toast.success(`Status changed to ${statusLabels[newStatus]}`);
        router.refresh();
      } else {
        toast.error(result.error || "Failed to update status");
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" disabled={isPending}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <Link href={`/dashboard/incidents/${incident.id}/edit`}>
          <DropdownMenuItem>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        {incident.status !== 0 && (
          <DropdownMenuItem onClick={() => handleStatusChange(0)}>
            <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
            Mark as Open
          </DropdownMenuItem>
        )}
        {incident.status !== 2 && (
          <DropdownMenuItem onClick={() => handleStatusChange(2)}>
            <Search className="h-4 w-4 mr-2 text-amber-500" />
            Mark as Investigating
          </DropdownMenuItem>
        )}
        {incident.status !== 1 && (
          <DropdownMenuItem onClick={() => handleStatusChange(1)}>
            <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />
            Mark as Resolved
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
