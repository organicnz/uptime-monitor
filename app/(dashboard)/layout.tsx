import {
  Activity,
  AlertTriangle,
  Bell,
  Globe,
  LayoutDashboard,
  Menu,
  Settings,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const handleSignOut = async () => {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/status-pages", label: "Status Pages", icon: Globe },
    { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/dashboard/maintenance", label: "Maintenance", icon: Wrench },
    { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="flex h-16 items-center justify-between">
            {/* Logo & Nav */}
            <div className="flex items-center gap-8">
              <Link
                href="/dashboard"
                className="group flex items-center gap-2.5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20 transition-shadow group-hover:shadow-emerald-500/30">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <span className="hidden text-lg font-bold tracking-tight sm:block">
                  Uptime<span className="text-primary">Monitor</span>
                </span>
              </Link>

              <nav className="hidden items-center gap-1 md:flex">
                {navItems.map((item) => (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  </Link>
                ))}
              </nav>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full bg-muted/50 px-3 py-1.5 text-sm sm:flex">
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <span className="max-w-[150px] truncate text-muted-foreground">
                  {user.email}
                </span>
              </div>

              <ThemeToggle />

              <form action={handleSignOut}>
                <Button
                  variant="outline"
                  size="sm"
                  type="submit"
                  className="border-border/50 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                >
                  Sign out
                </Button>
              </form>

              {/* Mobile menu button */}
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
