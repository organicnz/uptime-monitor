import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch monitors
    const { data: monitorsData, error } = await supabase
        .from('monitors')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    // Handle error or null data
    const monitors = error || !monitorsData ? [] : monitorsData as { id: string; user_id: string; name: string; url: string; active: boolean; type: string; created_at: string; updated_at: string }[]

    const activeMonitors = monitors.filter(m => m.active)
    const totalMonitors = monitors.length

    // Fetch recent checks (last 24 hours)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    type MonitorCheck = { id: string; monitor_id: string; status: 'up' | 'down' | 'degraded'; response_time: number; status_code: number | null; error_message: string | null; checked_at: string }
    const { data: recentChecksData } = await supabase
        .from('monitor_checks')
        .select('*, monitors!inner(user_id)')
        .eq('monitors.user_id', user.id)
        .gte('checked_at', yesterday.toISOString())
        .order('checked_at', { ascending: false })
        .limit(100)
    const recentChecks = (recentChecksData || []) as MonitorCheck[]

    const upChecks = recentChecks.filter(c => c.status === 'up').length
    const downChecks = recentChecks.filter(c => c.status === 'down').length
    const totalChecks = recentChecks.length
    const uptimePercentage = totalChecks > 0 ? ((upChecks / totalChecks) * 100).toFixed(2) : '0.00'

    // Calculate average response time
    const avgResponseTime = recentChecks.length
        ? Math.round(recentChecks.reduce((sum, check) => sum + check.response_time, 0) / recentChecks.length)
        : 0

    // Fetch active incidents
    type Incident = { id: string; monitor_id: string; status: 'ongoing' | 'resolved'; started_at: string; resolved_at: string | null; monitors: { user_id: string; name: string } }
    const { data: incidentsData } = await supabase
        .from('incidents')
        .select('*, monitors!inner(user_id, name)')
        .eq('monitors.user_id', user.id)
        .eq('status', 'ongoing')
        .order('started_at', { ascending: false })
    const activeIncidents = (incidentsData || []) as Incident[]

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Dashboard</h1>
                    <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                        Monitor your services and track uptime
                    </p>
                </div>
                <Link href="/dashboard/monitors/new">
                    <Button>Create Monitor</Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Monitors</CardTitle>
                        <Activity className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalMonitors}</div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                            {activeMonitors.length} active
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Uptime (24h)</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{uptimePercentage}%</div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                            {upChecks} of {totalChecks} checks
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{avgResponseTime}ms</div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                            Last 24 hours
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{activeIncidents?.length || 0}</div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                            Requires attention
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Active Incidents */}
            {activeIncidents && activeIncidents.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Active Incidents</CardTitle>
                        <CardDescription>Services currently experiencing issues</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {activeIncidents.map((incident) => (
                                <div
                                    key={incident.id}
                                    className="flex items-center justify-between p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950"
                                >
                                    <div className="flex items-center space-x-3">
                                        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                                        <div>
                                            <p className="font-medium">{incident.monitors.name}</p>
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                                Started {new Date(incident.started_at).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <Link href={`/dashboard/monitors/${incident.monitor_id}`}>
                                        <Button variant="outline" size="sm">View Details</Button>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Recent Monitors */}
            {monitors && monitors.length > 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Your Monitors</CardTitle>
                        <CardDescription>Recently created monitoring endpoints</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {monitors.slice(0, 5).map((monitor) => (
                                <Link
                                    key={monitor.id}
                                    href={`/dashboard/monitors/${monitor.id}`}
                                    className="flex items-center justify-between p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                                >
                                    <div>
                                        <p className="font-medium">{monitor.name}</p>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                            {monitor.url}
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${monitor.active
                                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                                            }`}>
                                            {monitor.active ? 'Active' : 'Paused'}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Get Started</CardTitle>
                        <CardDescription>Create your first monitor to start tracking uptime</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Activity className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mb-4" />
                        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
                            No monitors yet. Create one to get started!
                        </p>
                        <Link href="/dashboard/monitors/new">
                            <Button>Create Your First Monitor</Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
