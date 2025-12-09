import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, LayoutTemplate, ExternalLink, Globe, Eye } from "lucide-react";
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
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Status Pages</h1>
            <p className="text-muted-foreground mt-1">
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
              className="glass-card group hover:border-primary/30 transition-all"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-primary/10">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">
                        {page.title}
                      </CardTitle>
                      <CardDescription className="truncate max-w-[180px]">
                        {page.description || "No description"}
                      </CardDescription>
                    </div>
                  </div>
                  <Link
                    href={`/status/${page.slug}`}
                    target="_blank"
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* URL Preview */}
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <code className="text-sm text-muted-foreground font-mono">
                    /status/{page.slug}
                  </code>
                </div>

                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
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
            <Card className="col-span-full glass-card border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="p-4 bg-primary/10 rounded-2xl mb-4">
                  <LayoutTemplate className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  No status pages yet
                </h3>
                <p className="text-muted-foreground mb-6 text-center max-w-md">
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
