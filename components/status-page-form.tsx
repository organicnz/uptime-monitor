"use client";

import { AlertTriangle, ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
// Import Server Actions
import {
  createStatusPage,
  deleteStatusPage,
  updateStatusPage,
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
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              {initialData ? "Edit Status Page" : "New Status Page"}
            </h1>
            <p className="mt-1 text-neutral-400">
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
                    <Trash2 className="mr-2 h-4 w-4" />
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
        <div className="space-y-6 lg:col-span-2">
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
                <div className="flex rounded-md bg-neutral-800 shadow-sm ring-1 ring-neutral-700 ring-inset">
                  <span className="flex items-center pl-3 text-neutral-400 select-none sm:text-sm">
                    /status/
                  </span>
                  <input
                    type="text"
                    name="slug"
                    id="slug"
                    className="block flex-1 border-0 bg-transparent py-1.5 pl-1 text-white placeholder:text-neutral-500 focus:ring-0 sm:text-sm sm:leading-6"
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
                      <button
                        key={monitor.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={monitor.name}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-lg border p-3 transition-all ${
                          isSelected
                            ? "border-green-500/50 bg-green-500/10"
                            : "border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/50"
                        }`}
                        onClick={() => toggleMonitor(monitor.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              isSelected
                                ? "border-green-500 bg-green-500"
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
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-neutral-500">
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
              <div className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                <div className="border-b border-neutral-800 pb-4 text-center">
                  <h3 className="text-lg font-bold">
                    {formData.title || "Page Title"}
                  </h3>
                </div>
                <div className="flex items-center justify-center gap-2 rounded bg-green-900/20 p-2 text-green-400">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">
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
                          className="flex h-8 items-center justify-between rounded bg-neutral-900 px-3"
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
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle className="mr-2 inline h-4 w-4" />
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
