# Uptime Monitor

A self-hosted uptime monitoring application inspired by [Uptime Kuma](https://github.com/louislam/uptime-kuma), built with Next.js and Supabase.

[Live Demo](https://uptime-monitor-next.vercel.app/)

## Features

- **Multiple Monitor Types**: HTTP/HTTPS, TCP, Ping, DNS, Keyword
- **Notifications**: Telegram, Discord, Slack, Teams, Pushover, Webhooks
- **Status Pages**: Public dashboards with custom slugs
- **Incident Tracking**: Automatic incident creation and resolution
- **SSL Monitoring**: Certificate expiration alerts
- **MFA Support**: TOTP-based two-factor authentication
- **Real-time Updates**: WebSocket-powered live dashboard

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, Turbopack)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript (strict mode)
- **Cron**: QStash (Upstash)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase account
- Vercel account (for deployment)
- Upstash account (for QStash scheduling)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/organicnz/uptime-monitor.git
   cd uptime-monitor
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

4. Configure your `.env.local` with:
   - Supabase credentials (URL, anon key, service role key)
   - QStash credentials (token, signing keys)
   - Site URL

5. Set up the database:
   - Run the schema from `supabase/schema.sql` in your Supabase project

6. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001) in your browser.

## Environment Variables

See `.env.local.example` for all required variables:

| Variable                          | Description                                  |
| --------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anonymous key                       |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_SITE_URL`            | Public URL of your deployment                |
| `QSTASH_TOKEN`                    | QStash API token                             |
| `QSTASH_CURRENT_SIGNING_KEY`      | QStash signing key                           |
| `QSTASH_NEXT_SIGNING_KEY`         | QStash next signing key                      |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass secret for Vercel Authentication      |

## Cron Scheduling

Monitor checks are scheduled via [QStash](https://upstash.com/docs/qstash) (Upstash). The schedule can be configured through the dashboard settings.

Default: Every 3 minutes

The cron endpoint is protected and requires the `x-vercel-protection-bypass` header when Vercel Authentication is enabled.

## Development Tools

This project includes a **Rust-based audit tool** (`tools/audit`) for code quality, security checks, and automation.

### Building the Tool

```bash
npm run build:audit
```

### Commands

```bash
# Run all pre-commit checks
./tools/audit/target/release/audit start

# Generate favicons from SVG
./tools/audit/target/release/audit generate-favicons

# Run monitor checks locally
./tools/audit/target/release/audit local-cron --token $CRON_SECRET

# Test Vercel protection bypass
./tools/audit/target/release/audit test-bypass

# Clean up old Vercel deployments
./tools/audit/target/release/audit vercel-cleanup
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### QStash Setup

#### Option 1: Via Upstash Console (UI)

1. Create a schedule in [Upstash Console](https://console.upstash.com/qstash)
2. Set destination: `https://your-domain.vercel.app/api/cron/check-monitors`
3. Add header: `x-vercel-protection-bypass: <your-bypass-secret>`
4. Set cron expression (e.g., `*/3 * * * *` for every 3 minutes)

#### Option 2: Via CLI (Automation)

Set your QStash token:

```bash
export QSTASH_TOKEN="your-qstash-token"
```

**Create a schedule:**

```bash
curl -X POST "https://qstash.upstash.io/v2/schedules" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Upstash-Cron: */3 * * * *" \
  -H "Upstash-Forward-x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" \
  -d "https://your-domain.vercel.app/api/cron/check-monitors"
```

**List schedules:**

```bash
curl -s -H "Authorization: Bearer $QSTASH_TOKEN" \
  https://qstash.upstash.io/v2/schedules | jq '.'
```

**Pause a schedule:**

```bash
curl -X POST "https://qstash.upstash.io/v2/schedules/{schedule_id}/pause" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

**Resume a schedule:**

```bash
curl -X POST "https://qstash.upstash.io/v2/schedules/{schedule_id}/resume" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

**Delete a schedule:**

```bash
curl -X DELETE "https://qstash.upstash.io/v2/schedules/{schedule_id}" \
  -H "Authorization: Bearer $QSTASH_TOKEN"
```

**Trigger manually (one-time):**

```bash
curl -X POST "https://qstash.upstash.io/v2/publish/https://your-domain.vercel.app/api/cron/check-monitors" \
  -H "Authorization: Bearer $QSTASH_TOKEN" \
  -H "Upstash-Forward-x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"
```

#### Environment Variables for QStash

Get these from [Upstash Console](https://console.upstash.com/qstash):

```bash
QSTASH_TOKEN=eyJ...                    # API token for creating/managing schedules
QSTASH_CURRENT_SIGNING_KEY=sig_...     # Verify incoming webhook signatures
QSTASH_NEXT_SIGNING_KEY=sig_...        # Next rotation signing key
```

## Project Structure

```
app/                    # Next.js App Router pages
├── (auth)/            # Auth pages (login, signup, mfa)
├── (dashboard)/       # Protected dashboard pages
├── api/               # API routes
├── status/            # Public status pages
lib/                   # Utilities and services
├── supabase/          # Supabase clients
├── actions/           # Server actions
├── qstash.ts          # QStash client
components/            # Reusable UI components
supabase/              # Database schema
tools/audit/           # Rust CLI tool
```

## Security

- Row Level Security (RLS) on all database tables
- SSRF protection for monitor URLs
- Rate limiting on auth endpoints
- MFA support with TOTP
- Security headers (HSTS, CSP, X-Frame-Options)

## License

MIT
