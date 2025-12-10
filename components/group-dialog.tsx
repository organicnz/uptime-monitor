"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, FolderPlus } from "lucide-react";
import { createGroup, updateGroup } from "@/lib/actions/groups";
import { useRouter } from "next/navigation";

const colorOptions = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#64748b", label: "Slate" },
];

type Group = {
  id: string;
  name: string;
  description: string | null;
  color: string;
};

type GroupDialogProps = {
  group?: Group;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
};

export function GroupDialog({ group, trigger, onSuccess }: GroupDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedColor, setSelectedColor] = useState(group?.color || "#6366f1");
  const [name, setName] = useState(group?.name || "");
  const [description, setDescription] = useState(group?.description || "");

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("name", name);
    formData.set("description", description);
    formData.set("color", selectedColor);

    startTransition(async () => {
      const result = group
        ? await updateGroup(group.id, formData)
        : await createGroup(formData);

      if (result.success) {
        toast.success(group ? "Group updated" : "Group created");
        setOpen(false);
        setName("");
        setDescription("");
        router.refresh();
        onSuccess?.();
      } else {
        toast.error(result.error || "Something went wrong");
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <FolderPlus className="h-4 w-4" />
            New Group
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {group ? "Edit Group" : "Create Group"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {group
              ? "Update the group name and color"
              : "Create a group to organize your monitors"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Production Servers"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Main production infrastructure"
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={`h-8 w-8 rounded-full transition-all ${
                    selectedColor === color.value
                      ? "ring-2 ring-offset-2 ring-offset-background ring-primary"
                      : "hover:ring-1 hover:ring-muted-foreground"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={isPending || !name.trim()}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {group ? "Updating..." : "Creating..."}
              </>
            ) : group ? (
              "Update Group"
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Group
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
