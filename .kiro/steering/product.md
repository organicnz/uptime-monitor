# Product Overview

Uptime Monitor is a self-hosted uptime monitoring application inspired by Uptime Kuma.

## Core Features

- **Monitor Types**: HTTP/HTTPS, TCP, Ping, DNS, Keyword, Docker, Steam
- **Notifications**: Telegram, Discord, Slack, Microsoft Teams, Pushover, Webhooks, Email (planned)
- **Status Pages**: Public-facing status pages with custom slugs and themes
- **Incident Tracking**: Automatic incident creation and resolution tracking
- **Maintenance Windows**: Scheduled maintenance with alert suppression

## Key Concepts

- **Monitors**: Track endpoint availability with configurable intervals, timeouts, and retry logic
- **Heartbeats**: Individual check results with status (UP/DOWN/PENDING/MAINTENANCE), response time, and messages
- **Notification Channels**: User-configured alert destinations, can be per-monitor or default for all
- **Status Pages**: Public dashboards showing monitor health for external stakeholders

## User Flow

1. User signs up/logs in via Supabase Auth
2. Creates monitors for endpoints to track
3. Configures notification channels for alerts
4. Optionally creates public status pages
5. Cron job runs checks at configured intervals
6. Notifications sent on status changes
