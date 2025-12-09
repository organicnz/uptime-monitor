import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const handleSignOut = async () => {
        'use server'
        const supabase = await createClient()
        await supabase.auth.signOut()
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-8">
                            <Link href="/dashboard" className="text-xl font-bold">
                                UptimeMonitor
                            </Link>
                            <nav className="hidden md:flex space-x-6">
                                <Link
                                    href="/dashboard"
                                    className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
                                >
                                    Dashboard
                                </Link>
                                <Link
                                    href="/dashboard/monitors"
                                    className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
                                >
                                    Monitors
                                </Link>
                                <Link
                                    href="/dashboard/status-pages"
                                    className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
                                >
                                    Status Pages
                                </Link>
                                <Link
                                    href="/dashboard/notifications"
                                    className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors"
                                >
                                    Notifications
                                </Link>
                            </nav>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm text-neutral-600 dark:text-neutral-400">
                                {user.email}
                            </span>
                            <form action={handleSignOut}>
                                <Button variant="outline" size="sm" type="submit">
                                    Sign out
                                </Button>
                            </form>
                        </div>
                    </div>
                </div>
            </header>
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
        </div>
    )
}
