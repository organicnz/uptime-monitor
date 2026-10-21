import { ExternalLink, Eye, Globe, LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { StatusPage } from "@/types/application";

export default async function StatusPagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: rawStatusPages } = await supabase
    .from("status_pages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const statusPages = (rawStatusPages || []) as unknown as StatusPage[];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="gradient-text text-3xl font-bold">Status Pages</h1>
            <p className="mt-1 text-muted-foreground">
              Create public status pages to showcase your monitor uptime
            </p>
          </div>
          <Link href="/dashboard/status-pages/new">
            <Button className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Create Status Page
            </Button>
          </Link>
        </div>

        {/* Status Pages Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statusPages?.map((page) => (
            <Card
              key={page.id}
              className="glass-card group transition-all hover:border-primary/30"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg transition-colors group-hover:text-primary">
                        {page.title}
                      </CardTitle>
                      <CardDescription className="max-w-[180px] truncate">
                        {page.description || "No description"}
                      </CardDescription>
                    </div>
                  </div>
                  <Link
                    href={`/status/${page.slug}`}
                    target="_blank"
                    className="rounded-lg p-2 transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* URL Preview */}
                <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <code className="font-mono text-sm text-muted-foreground">
                    /status/{page.slug}
                  </code>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                      page.is_public
                        ? "bg-emerald-500/10 text-emerald-500"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {page.is_public && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    )}
                    {page.is_public ? "Public" : "Private"}
                  </span>

                  <Link href={`/dashboard/status-pages/${page.id}`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Empty State */}
          {(!statusPages || statusPages.length === 0) && (
            <Card className="glass-card col-span-full border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 rounded-2xl bg-primary/10 p-4">
                  <LayoutTemplate className="h-12 w-12 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold">
                  No status pages yet
                </h3>
                <p className="mb-6 max-w-md text-center text-muted-foreground">
                  Create a public status page to share your uptime status with
                  your users.
                </p>
                <Link href="/dashboard/status-pages/new">
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Your First Status Page
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
