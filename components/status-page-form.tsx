"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, ArrowLeft, Check, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
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
// Import Server Actions
import {
  createStatusPage,
  updateStatusPage,
  deleteStatusPage,
} from "@/lib/actions/status-pages";

// Import Global Types
import { Monitor } from "@/types/application";

interface StatusPageFormProps {
  monitors: Monitor[];
  initialData?: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    is_public: boolean;
    monitors: { monitor_id: string }[];
  };
}

export function StatusPageForm({ monitors, initialData }: StatusPageFormProps) {
  useRouter(); // Keep for potential future navigation
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState(() => {
    const initialMonitorIds =
      initialData?.monitors?.map((m: { monitor_id: string }) => m.monitor_id) ||
      [];
    return {
      title: initialData?.title || "",
      slug: initialData?.slug || "",
      description: initialData?.description || "",
      is_public: initialData?.is_public ?? true,
      monitor_ids: new Set<string>(initialMonitorIds),
    };
  });

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(!!initialData);

  // Compute the display slug - either manually edited or auto-generated from title
  const displaySlug =
    slugManuallyEdited || initialData
      ? formData.slug
      : formData.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

  const toggleMonitor = (id: string) => {
    const newids = new Set(formData.monitor_ids);
    if (newids.has(id)) {
      newids.delete(id);
    } else {
      newids.add(id);
    }
    setFormData({ ...formData, monitor_ids: newids });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Prepare FormData for Server Action
      const data = new FormData();
      data.append("title", formData.title);
      data.append("slug", displaySlug);
      if (formData.description)
        data.append("description", formData.description);
      if (formData.is_public) data.append("is_public", "on");

      // Append multiple monitor_ids
      Array.from(formData.monitor_ids).forEach((id) => {
        data.append("monitor_ids", id);
      });

      const result = initialData
        ? await updateStatusPage(initialData.id, null, data)
        : await createStatusPage(null, data);

      if (result?.error) {
        setError(result.error);
        setIsLoading(false);
      }
      // Success redirects automatically in Server Action
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialData) return;
    setIsDeleting(true);
    try {
      await deleteStatusPage(initialData.id);
      // Success redirects automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 p-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/status-pages">
            <Button variant="outline" size="sm" type="button">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              {initialData ? "Edit Status Page" : "New Status Page"}
            </h1>
            <p className="text-neutral-400 mt-1">
              Configure your public status page details
            </p>
          </div>
        </div>
        {initialData && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" type="button" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Page
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete
                  your status page and remove it from public access.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Page Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Acme System Status"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <div className="flex rounded-md shadow-sm ring-1 ring-inset ring-neutral-700 bg-neutral-800">
                  <span className="flex select-none items-center pl-3 text-neutral-400 sm:text-sm">
                    /status/
                  </span>
                  <input
                    type="text"
                    name="slug"
                    id="slug"
                    className="flex-1 block bg-transparent border-0 py-1.5 pl-1 text-white placeholder:text-neutral-500 focus:ring-0 sm:text-sm sm:leading-6"
                    placeholder="acme-status"
                    value={displaySlug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setFormData({ ...formData, slug: e.target.value });
                    }}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Tell your users what this page is about..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_public"
                  checked={formData.is_public}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_public: checked })
                  }
                />
                <Label htmlFor="is_public">Make Publicly Accessible</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select Monitors</CardTitle>
              <CardDescription>
                Choose which monitors to display on this status page
              </CardDescription>
            </CardHeader>
            <CardContent>
              {monitors.length > 0 ? (
                <div className="grid gap-2">
                  {monitors.map((monitor) => {
                    const isSelected = formData.monitor_ids.has(monitor.id);
                    return (
                      <div
                        key={monitor.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-green-500/10 border-green-500/50"
                            : "bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800/50"
                        }`}
                        onClick={() => toggleMonitor(monitor.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected
                                ? "bg-green-500 border-green-500"
                                : "border-neutral-600"
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-black" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {monitor.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-neutral-500">
                              <span className="uppercase">{monitor.type}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-neutral-500">
                  No monitors available. Create some monitors first.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-neutral-950 border border-neutral-800 space-y-4">
                <div className="text-center pb-4 border-b border-neutral-800">
                  <h3 className="font-bold text-lg">
                    {formData.title || "Page Title"}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-green-400 bg-green-900/20 p-2 rounded justify-center">
                  <Check className="h-4 w-4" />
                  <span className="font-medium text-sm">
                    All Systems Operational
                  </span>
                </div>
                <div className="space-y-2">
                  {Array.from(formData.monitor_ids)
                    .slice(0, 3)
                    .map((id) => {
                      const m = monitors.find((m) => m.id === id);
                      return m ? (
                        <div
                          key={id}
                          className="h-8 bg-neutral-900 rounded flex items-center px-3 justify-between"
                        >
                          <span className="text-xs text-neutral-400">
                            {m.name}
                          </span>
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                        </div>
                      ) : null;
                    })}
                  {formData.monitor_ids.size > 3 && (
                    <div className="text-center text-xs text-neutral-500">
                      + {formData.monitor_ids.size - 3} more
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Link href="/dashboard/status-pages" className="w-full">
              <Button
                variant="outline"
                className="w-full"
                type="button"
                disabled={isLoading}
              >
                Cancel
              </Button>
            </Link>
            <Button className="w-full" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
