import { createClient } from '@/lib/supabase/server'

export interface TelegramConfig {
    bot_token: string
    chat_id: string
}

export interface DiscordConfig {
    webhook_url: string
}

export interface SlackConfig {
    webhook_url: string
}

export interface WebhookConfig {
    url: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
}

export interface EmailConfig {
    email: string
}

export type NotificationConfig = TelegramConfig | DiscordConfig | SlackConfig | WebhookConfig | EmailConfig

export type NotificationType = 'email' | 'discord' | 'slack' | 'webhook' | 'telegram'

export interface NotificationPayload {
    title: string
    message: string
    monitorName?: string
    monitorUrl?: string
    status?: 'up' | 'down' | 'degraded'
    timestamp?: string
}

// Send Telegram notification
export async function sendTelegramNotification(
    config: TelegramConfig,
    payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
    const { bot_token, chat_id } = config

    // Format message with emoji based on status
    const statusEmoji = payload.status === 'up' ? '✅' : payload.status === 'down' ? '🔴' : '⚠️'
    const text = `${statusEmoji} *${escapeMarkdown(payload.title)}*

${escapeMarkdown(payload.message)}${payload.monitorName ? `\n\n📍 *Monitor:* ${escapeMarkdown(payload.monitorName)}` : ''}${payload.monitorUrl ? `\n🔗 *URL:* ${escapeMarkdown(payload.monitorUrl)}` : ''}${payload.timestamp ? `\n🕐 *Time:* ${escapeMarkdown(payload.timestamp)}` : ''}`

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${bot_token}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id,
                    text,
                    parse_mode: 'MarkdownV2',
                    disable_web_page_preview: true,
                }),
            }
        )

        const data = await response.json()

        if (!response.ok || !data.ok) {
            return {
                success: false,
                error: data.description || 'Failed to send Telegram message',
            }
        }

        return { success: true }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }
    }
}

// Escape special characters for Telegram MarkdownV2
function escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

// Send Discord notification
export async function sendDiscordNotification(
    config: DiscordConfig,
    payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
    const color = payload.status === 'up' ? 0x00ff00 : payload.status === 'down' ? 0xff0000 : 0xffff00

    try {
        const response = await fetch(config.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: payload.title,
                    description: payload.message,
                    color,
                    fields: [
                        payload.monitorName ? { name: 'Monitor', value: payload.monitorName, inline: true } : null,
                        payload.monitorUrl ? { name: 'URL', value: payload.monitorUrl, inline: true } : null,
                    ].filter(Boolean),
                    timestamp: payload.timestamp || new Date().toISOString(),
                }],
            }),
        })

        if (!response.ok) {
            return { success: false, error: `Discord API error: ${response.status}` }
        }

        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

// Send Slack notification
export async function sendSlackNotification(
    config: SlackConfig,
    payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
    const color = payload.status === 'up' ? 'good' : payload.status === 'down' ? 'danger' : 'warning'

    try {
        const response = await fetch(config.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attachments: [{
                    color,
                    title: payload.title,
                    text: payload.message,
                    fields: [
                        payload.monitorName ? { title: 'Monitor', value: payload.monitorName, short: true } : null,
                        payload.monitorUrl ? { title: 'URL', value: payload.monitorUrl, short: true } : null,
                    ].filter(Boolean),
                    ts: payload.timestamp ? new Date(payload.timestamp).getTime() / 1000 : Date.now() / 1000,
                }],
            }),
        })

        if (!response.ok) {
            return { success: false, error: `Slack API error: ${response.status}` }
        }

        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

// Send webhook notification
export async function sendWebhookNotification(
    config: WebhookConfig,
    payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch(config.url, {
            method: config.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...config.headers,
            },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            return { success: false, error: `Webhook error: ${response.status}` }
        }

        return { success: true }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}

// Main dispatcher function
export async function sendNotification(
    type: NotificationType,
    config: NotificationConfig,
    payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
    switch (type) {
        case 'telegram':
            return sendTelegramNotification(config as TelegramConfig, payload)
        case 'discord':
            return sendDiscordNotification(config as DiscordConfig, payload)
        case 'slack':
            return sendSlackNotification(config as SlackConfig, payload)
        case 'webhook':
            return sendWebhookNotification(config as WebhookConfig, payload)
        case 'email':
            // Email would require additional setup (SMTP, SendGrid, etc.)
            return { success: false, error: 'Email notifications not yet implemented' }
        default:
            return { success: false, error: `Unknown notification type: ${type}` }
    }
}

// Send notification to all active channels for a user
export async function notifyUser(
    userId: string,
    payload: NotificationPayload
): Promise<{ sent: number; failed: number; errors: string[] }> {
    const supabase = await createClient()
    type NotificationChannel = { id: string; user_id: string; type: NotificationType; name: string; config: NotificationConfig; active: boolean }
    const { data: channelsData, error } = await supabase
        .from('notification_channels')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)

    const channels = (channelsData || []) as NotificationChannel[]

    if (error || channels.length === 0) {
        return { sent: 0, failed: 0, errors: error ? [error.message] : [] }
    }

    const results = await Promise.all(
        channels.map(async (channel) => {
            const result = await sendNotification(
                channel.type,
                channel.config,
                payload
            )
            return { channel: channel.name, ...result }
        })
    )

    const sent = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    const errors = results.filter(r => !r.success).map(r => `${r.channel}: ${r.error}`)

    return { sent, failed, errors }
}
