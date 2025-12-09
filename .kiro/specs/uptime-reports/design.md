# Uptime Reports - Design

## Database Schema

### report_configs

```sql
CREATE TABLE report_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER, -- 0-6 for weekly
  day_of_month INTEGER, -- 1-31 for monthly
  time_of_day TIME DEFAULT '09:00',
  timezone TEXT DEFAULT 'UTC',
  monitor_ids UUID[], -- NULL = all monitors
  recipients TEXT[], -- Email addresses
  include_charts BOOLEAN DEFAULT true,
  include_incidents BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### generated_reports

```sql
CREATE TABLE generated_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id UUID REFERENCES report_configs(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  report_data JSONB NOT NULL,
  pdf_url TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_user_id ON generated_reports(user_id);
CREATE INDEX idx_reports_created_at ON generated_reports(created_at DESC);
```

## Report Data Structure

```typescript
interface ReportData {
  summary: {
    totalMonitors: number;
    overallUptime: number;
    avgResponseTime: number;
    totalIncidents: number;
    periodStart: string;
    periodEnd: string;
  };
  comparison: {
    uptimeChange: number; // percentage points
    responseTimeChange: number; // ms
    incidentChange: number; // count
  };
  monitors: MonitorReportData[];
  incidents: IncidentSummary[];
  charts: {
    uptimeTrend: DataPoint[];
    responseTimeTrend: DataPoint[];
  };
}

interface MonitorReportData {
  id: string;
  name: string;
  type: string;
  uptime: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  incidentCount: number;
  totalChecks: number;
  failedChecks: number;
}
```

## Report Generation Flow

```
1. Cron triggers at scheduled time
2. Query report_configs due for generation
3. For each config:
   a. Calculate period (last day/week/month)
   b. Query heartbeats for period
   c. Calculate metrics per monitor
   d. Query incidents for period
   e. Generate comparison with previous period
   f. Build chart data
   g. Store in generated_reports
   h. If recipients configured, send email
   i. Update last_generated_at
```

## API Endpoints

### GET /api/reports

```typescript
// Query params: page, limit
// Returns: { reports: GeneratedReport[], total: number }
```

### POST /api/reports/configs

```typescript
// Body: ReportConfigInput
// Returns: ReportConfig
```

### POST /api/reports/[configId]/generate

```typescript
// Triggers immediate report generation
// Returns: { reportId: string, status: 'generating' }
```

### GET /api/reports/[reportId]/pdf

```typescript
// Returns: PDF file stream
// Or: { url: string } for pre-generated PDF
```

## Email Template

Using React Email for consistent rendering:

```tsx
// lib/reports/email-template.tsx
export function ReportEmail({ report }: { report: ReportData }) {
  return (
    <Html>
      <Head />
      <Body>
        <Container>
          <Heading>
            Uptime Report: {report.summary.periodStart} -{" "}
            {report.summary.periodEnd}
          </Heading>
          <Section>
            <Text>Overall Uptime: {report.summary.overallUptime}%</Text>
            <Text>Avg Response Time: {report.summary.avgResponseTime}ms</Text>
            <Text>Incidents: {report.summary.totalIncidents}</Text>
          </Section>
          {/* Monitor table, charts as images */}
        </Container>
      </Body>
    </Html>
  );
}
```

## UI Components

### ReportConfigForm

- Frequency selector (daily/weekly/monthly)
- Schedule picker (day, time)
- Monitor multi-select
- Recipient email input (tags)
- Preview button

### ReportViewer

- Summary cards at top
- Comparison badges (↑ ↓)
- Monitor performance table
- Embedded recharts
- Download PDF button
