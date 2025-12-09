import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bell, Plus, Trash2, TestTube, MessageCircle, Mail, Webhook } from 'lucide-react'

type NotificationChannel = {
    id: string
    name: string
    type: 'email' | 'discord' | 'slack' | 'webhook' | 'telegram'
    active: boolean
    created_at: string
}

const typeIcons = {
    telegram: MessageCircle,
    email: Mail,
    discord: MessageCircle,
    slack: MessageCircle,
    webhook: Webhook,
}

const typeColors = {
    telegram: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    email: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    discord: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
    slack: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    webhook: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
}

export default async function NotificationsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: channelsData } = await supabase
        .from('notification_channels')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

    const channels = (channelsData || []) as NotificationChannel[]

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Notification Channels</h1>
                    <p className="text-neutral-600 dark:text-neutral-400 mt-1">
                        Configure how you receive alerts when monitors go down
                    </p>
                </div>
                <Link href="/dashboard/notifications/new">
                    <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Channel
                    </Button>
                </Link>
            </div>

            {/* Telegram Setup Guide */}
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <MessageCircle className="h-5 w-5" />
                        Telegram Setup Guide
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2 text-blue-700 dark:text-blue-300">
                    <p><strong>1.</strong> Message <a href="https://t.me/BotFather" target="_blank" className="underline">@BotFather</a> on Telegram and create a new bot with <code>/newbot</code></p>
                    <p><strong>2.</strong> Copy the bot token provided by BotFather</p>
                    <p><strong>3.</strong> Start a chat with your new bot or add it to a group</p>
                    <p><strong>4.</strong> Get your chat ID by sending a message and visiting: <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></p>
                </CardContent>
            </Card>

            {/* Channels List */}
            {channels.length > 0 ? (
                <div className="grid gap-4">
                    {channels.map((channel) => {
                        const Icon = typeIcons[channel.type] || Bell
                        const colorClass = typeColors[channel.type] || typeColors.webhook

                        return (
                            <Card key={channel.id}>
                                <CardContent className="flex items-center justify-between py-4">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2 rounded-lg ${colorClass}`}>
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-medium">{channel.name}</p>
                                            <p className="text-sm text-neutral-600 dark:text-neutral-400 capitalize">
                                                {channel.type}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${channel.active
                                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                                            }`}>
                                            {channel.active ? 'Active' : 'Paused'}
                                        </span>
                                        <form action={`/api/notifications/test`} method="POST">
                                            <input type="hidden" name="channelId" value={channel.id} />
                                            <Button variant="outline" size="sm" type="button"
                                                onClick={async () => {
                                                    'use client'
                                                }}>
                                                <TestTube className="h-4 w-4" />
                                            </Button>
                                        </form>
                                        <Link href={`/dashboard/notifications/${channel.id}/edit`}>
                                            <Button variant="outline" size="sm">Edit</Button>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Bell className="h-16 w-16 text-neutral-400 dark:text-neutral-600 mb-4" />
                        <p className="text-neutral-600 dark:text-neutral-400 mb-4 text-center">
                            No notification channels configured yet.<br />
                            Add one to receive alerts when your monitors go down.
                        </p>
                        <Link href="/dashboard/notifications/new">
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Add Your First Channel
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
