import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Github,
  Globe,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { COPYRIGHT_YEAR } from "@/lib/constants";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Uptime<span className="text-primary">Monitor</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="shadow-lg shadow-primary/20">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-32">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="animate-pulse-slow absolute top-[10%] left-[10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="animate-pulse-slow absolute top-[20%] right-[10%] h-[400px] w-[400px] rounded-full bg-chart-5/20 blur-[120px]" />
          <div className="animate-pulse-slow absolute bottom-[10%] left-[30%] h-[300px] w-[300px] rounded-full bg-chart-2/20 blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 text-center lg:px-6">
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Is your website down right now?
          </div>

          {/* Headline */}
          <h1 className="mx-auto mb-8 max-w-4xl text-5xl leading-[1.1] font-bold tracking-tight md:text-7xl">
            Downtime happens.{" "}
            <span className="gradient-text">Know about it first.</span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-muted-foreground">
            Professional uptime monitoring for your websites, APIs, and servers.
            Get instant alerts via Telegram, Slack, Discord, and more. Open
            source and self-hostable.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/login">
              <Button
                size="lg"
                className="h-13 rounded-full px-8 text-lg shadow-xl shadow-primary/30 transition-all hover:scale-105 hover:shadow-primary/40"
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link
              href="https://github.com/organicnz/uptime-monitor"
              target="_blank"
            >
              <Button
                size="lg"
                variant="outline"
                className="h-13 rounded-full px-8 text-lg"
              >
                <Github className="mr-2 h-5 w-5" />
                View on GitHub
              </Button>
            </Link>
          </div>

          {/* Social Proof */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-muted-foreground">
            {["HTTP/HTTPS", "TCP Ports", "Ping", "DNS", "Keywords"].map(
              (type) => (
                <div key={type} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{type}</span>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-y border-border/50 bg-muted/30 py-24">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Everything you need to stay online
            </h2>
            <p className="text-lg text-muted-foreground">
              Powerful features packed into a simple, intuitive interface. Set
              up your first monitor in under 60 seconds.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Globe className="h-6 w-6" />}
              iconColor="text-blue-500"
              iconBg="bg-blue-500/10"
              title="Global Monitoring"
              description="Monitor HTTP, HTTPS, TCP, Ping, and DNS records from multiple locations worldwide."
            />
            <FeatureCard
              icon={<Bell className="h-6 w-6" />}
              iconColor="text-purple-500"
              iconBg="bg-purple-500/10"
              title="Instant Alerts"
              description="Get notified immediately via Telegram, Slack, Discord, Teams, Webhooks, and more."
            />
            <FeatureCard
              icon={<Activity className="h-6 w-6" />}
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
              title="Status Pages"
              description="Create beautiful public status pages to keep your customers informed in real-time."
            />
            <FeatureCard
              icon={<Clock className="h-6 w-6" />}
              iconColor="text-orange-500"
              iconBg="bg-orange-500/10"
              title="SSL Expiry"
              description="Never let a certificate expire again. We'll remind you before it's too late."
            />
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              title="Response Times"
              description="Track latency trends and optimize your application performance over time."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              iconColor="text-indigo-500"
              iconBg="bg-indigo-500/10"
              title="Maintenance Windows"
              description="Schedule maintenance to pause alerts during planned downtime periods."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-[20%] h-[400px] w-[400px] rounded-full bg-primary/10 blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 text-center lg:px-6">
          <h2 className="mb-4 text-3xl font-bold md:text-4xl">
            Ready to start monitoring?
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-lg text-muted-foreground">
            Join thousands of developers who trust Uptime Monitor to keep their
            services running smoothly.
          </p>
          <Link href="/login">
            <Button
              size="lg"
              className="h-13 rounded-full px-8 text-lg shadow-xl shadow-primary/30"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12">
        <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-4 md:flex-row lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">Uptime Monitor</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {COPYRIGHT_YEAR} Uptime Monitor. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="#" className="transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link href="#" className="transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link
              href="https://github.com/organicnz/uptime-monitor"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  iconColor,
  iconBg,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
      <div
        className={`h-12 w-12 rounded-xl ${iconBg} mb-4 flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}
      >
        <span className={iconColor}>{icon}</span>
      </div>
      <h3 className="mb-2 text-lg font-bold transition-colors group-hover:text-primary">
        {title}
      </h3>
      <p className="leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
