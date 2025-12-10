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
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderX,
} from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteGroup,
  toggleGroupCollapsed,
  assignMonitorToGroup,
} from "@/lib/actions/groups";

type Group = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  collapsed: boolean;
};

type GroupCardActionsProps = {
  group: Group;
  onEdit: () => void;
};

export function GroupCardActions({ group, onEdit }: GroupCardActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (
      !confirm(
        "Delete this group? Monitors will be unassigned but not deleted.",
      )
    )
      return;

    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result.success) {
        toast.success("Group deleted");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to delete");
      }
    });
  };

  const handleToggleCollapsed = () => {
    startTransition(async () => {
      await toggleGroupCollapsed(group.id);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleToggleCollapsed}
        disabled={isPending}
      >
        {group.collapsed ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={isPending}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Group
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Group
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type MonitorGroupActionsProps = {
  monitorId: string;
  currentGroupId: string | null;
  groups: Group[];
};

export function MonitorGroupActions({
  monitorId,
  currentGroupId,
  groups,
}: MonitorGroupActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleMoveToGroup = (groupId: string | null) => {
    startTransition(async () => {
      const result = await assignMonitorToGroup(monitorId, groupId);
      if (result.success) {
        toast.success(groupId ? "Moved to group" : "Removed from group");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to move");
      }
    });
  };

  const otherGroups = groups.filter((g) => g.id !== currentGroupId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={isPending}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {otherGroups.map((group) => (
          <DropdownMenuItem
            key={group.id}
            onClick={() => handleMoveToGroup(group.id)}
          >
            <div
              className="h-3 w-3 rounded-full mr-2"
              style={{ backgroundColor: group.color }}
            />
            Move to {group.name}
          </DropdownMenuItem>
        ))}
        {currentGroupId && (
          <>
            {otherGroups.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => handleMoveToGroup(null)}>
              <FolderX className="h-4 w-4 mr-2" />
              Remove from Group
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
