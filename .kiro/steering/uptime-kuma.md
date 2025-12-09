# Uptime Kuma Influence

This project is inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), a popular self-hosted monitoring tool. We aim to provide similar functionality with a modern Next.js stack.

## Terminology Alignment

| Uptime Kuma  | This Project            | Description                |
| ------------ | ----------------------- | -------------------------- |
| Heartbeat    | `heartbeats` table      | Individual check results   |
| Monitor      | `monitors` table        | Endpoint being tracked     |
| Notification | `notification_channels` | Alert destinations         |
| Status Page  | `status_pages`          | Public status dashboards   |
| Maintenance  | `maintenance`           | Scheduled downtime windows |

## Monitor Types

Supported (matching Uptime Kuma):

- `http` - HTTP/HTTPS endpoint checks
- `tcp` - TCP port connectivity
- `ping` - ICMP ping checks
- `keyword` - HTTP + keyword presence validation
- `dns` - DNS resolution checks

Schema supports but not yet implemented:

- `docker` - Docker container health
- `steam` - Steam game server status

## Status Codes

Heartbeat status values (matching Uptime Kuma conventions):

- `0` = DOWN
- `1` = UP
- `2` = PENDING
- `3` = MAINTENANCE

Incident status values:

- `0` = OPEN
- `1` = RESOLVED
- `2` = INVESTIGATING

## Feature Parity Goals

Implemented:

- Multi-type monitors with configurable intervals
- Response time tracking (ping/latency)
- Multi-channel notifications (Telegram, Discord, Slack, Teams, Pushover, Webhook)
- Public status pages with custom slugs
- Incident tracking
- Dark mode UI

Planned:

- Certificate expiry monitoring
- Maintenance windows with alert suppression
- Monitor groups/tags
- 2FA authentication
- Docker/Steam monitor types
- Email notifications (requires SMTP setup)

## Design Philosophy

- Keep the simple, focused UX that makes Uptime Kuma popular
- Leverage Supabase for auth, realtime, and database instead of SQLite
- Deploy easily on Vercel with serverless cron for checks
- Open source and self-hostable
