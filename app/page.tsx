import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Bell, Clock, Globe, Shield, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-black">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium mb-6">
            <Activity className="h-4 w-4" />
            <span>Professional Uptime Monitoring</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            Monitor Your Services
            <br />
            Stay Always Online
          </h1>

          <p className="text-xl text-neutral-600 dark:text-neutral-400 mb-8 max-w-2xl mx-auto">
            Self-hosted uptime monitoring inspired by Uptime Kuma. Track HTTP,
            TCP, Ping, and more with instant notifications when things go down.
          </p>

          <div className="flex gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8">
                Get Started Free
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          <Card className="border-2 hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mb-4">
                <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                Multiple Monitor Types
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                HTTP/HTTPS, TCP ports, Ping, DNS, and keyword monitoring. All in
                one place.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-purple-500 dark:hover:border-purple-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mb-4">
                <Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                Instant Notifications
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Get alerted via Telegram, Discord, Slack, or custom webhooks
                when services go down.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-green-500 dark:hover:border-green-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mb-4">
                <Activity className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                Public Status Pages
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Share real-time status with your users through beautiful,
                customizable status pages.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-yellow-500 dark:hover:border-yellow-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Detailed Analytics</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Track uptime percentages, response times, and incident history
                with beautiful charts.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-red-500 dark:hover:border-red-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Lightning Fast</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Built with Next.js 16 and Supabase for blazing fast performance
                and real-time updates.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors">
            <CardContent className="pt-6">
              <div className="h-12 w-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Self-Hosted</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Deploy on Vercel, keep full control of your data. Open source
                and transparent.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <Card className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-500 dark:to-purple-500 border-0">
            <CardContent className="py-12">
              <h2 className="text-3xl font-bold text-white mb-4">
                Ready to start monitoring?
              </h2>
              <p className="text-blue-100 dark:text-blue-50 mb-6 text-lg">
                Create your account and set up your first monitor in minutes.
              </p>
              <Link href="/signup">
                <Button size="lg" variant="secondary" className="text-lg px-8">
                  Get Started Now →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
