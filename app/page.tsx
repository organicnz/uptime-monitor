import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Bell,
  Clock,
  Globe,
  Shield,
  Zap,
  ArrowRight,
  CheckCircle2,
  Github,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
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
      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-[10%] left-[10%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow" />
          <div className="absolute top-[20%] right-[10%] w-[400px] h-[400px] bg-chart-5/20 rounded-full blur-[120px] animate-pulse-slow" />
          <div className="absolute bottom-[10%] left-[30%] w-[300px] h-[300px] bg-chart-2/20 rounded-full blur-[100px] animate-pulse-slow" />
        </div>

        <div className="container mx-auto px-4 lg:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            Is your website down right now?
          </div>

          {/* Headline */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 max-w-4xl mx-auto leading-[1.1]">
            Downtime happens.{" "}
            <span className="gradient-text">Know about it first.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Professional uptime monitoring for your websites, APIs, and servers.
            Get instant alerts via Telegram, Slack, Discord, and more. Open
            source and self-hostable.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/login">
              <Button
                size="lg"
                className="text-lg px-8 h-13 rounded-full shadow-xl shadow-primary/30 hover:shadow-primary/40 transition-all hover:scale-105"
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
                className="text-lg px-8 h-13 rounded-full"
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
      <section className="py-24 bg-muted/30 border-y border-border/50">
        <div className="container mx-auto px-4 lg:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to stay online
            </h2>
            <p className="text-muted-foreground text-lg">
              Powerful features packed into a simple, intuitive interface. Set
              up your first monitor in under 60 seconds.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-[20%] w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px]" />
        </div>

        <div className="container mx-auto px-4 lg:px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to start monitoring?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Join thousands of developers who trust Uptime Monitor to keep their
            services running smoothly.
          </p>
          <Link href="/login">
            <Button
              size="lg"
              className="text-lg px-8 h-13 rounded-full shadow-xl shadow-primary/30"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="container mx-auto px-4 lg:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-green-600">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">Uptime Monitor</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Uptime Monitor. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="#" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link
              href="https://github.com/organicnz/uptime-monitor"
              className="hover:text-foreground transition-colors"
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
    <div className="group p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300">
      <div
        className={`h-12 w-12 rounded-xl ${iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
      >
        <span className={iconColor}>{icon}</span>
      </div>
      <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
        {title}
      </h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
