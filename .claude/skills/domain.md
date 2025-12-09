# Domain Knowledge

## Monitor Types

Supported: `http`, `tcp`, `ping`, `keyword`, `dns`
Schema supports (not implemented): `docker`, `steam`

## Status Codes

```typescript
// Heartbeat status
const HEARTBEAT_STATUS = {
  DOWN: 0,
  UP: 1,
  PENDING: 2,
  MAINTENANCE: 3,
};

// Incident status
const INCIDENT_STATUS = {
  OPEN: 0,
  RESOLVED: 1,
  INVESTIGATING: 2,
};
```

## Notification Channel Types

`telegram`, `discord`, `slack`, `teams`, `pushover`, `webhook`
Planned: `email`

## Key Tables

| Table                   | Description                          |
| ----------------------- | ------------------------------------ |
| `profiles`              | User accounts (linked to auth.users) |
| `monitors`              | Endpoints being tracked              |
| `heartbeats`            | Individual check results             |
| `incidents`             | Outage tracking                      |
| `notification_channels` | Alert destinations                   |
| `status_pages`          | Public status dashboards             |
| `maintenance`           | Scheduled downtime windows           |

## Terminology (Uptime Kuma alignment)

| Uptime Kuma  | This Project            |
| ------------ | ----------------------- |
| Heartbeat    | `heartbeats` table      |
| Monitor      | `monitors` table        |
| Notification | `notification_channels` |
| Status Page  | `status_pages`          |
| Maintenance  | `maintenance`           |
