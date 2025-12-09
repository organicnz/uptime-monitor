# Uptime Reports - Tasks

## Phase 1: Database & Types

- [ ] Create `report_configs` table migration
- [ ] Create `generated_reports` table migration
- [ ] Add report-related types to `types/database.ts`
- [ ] Create `types/reports.ts` for report data structures

## Phase 2: Report Generation Engine

- [ ] Create `lib/reports/generator.ts` - main report generation logic
- [ ] Create `lib/reports/metrics.ts` - uptime/latency calculations
- [ ] Create `lib/reports/comparisons.ts` - period-over-period logic
- [ ] Implement incident aggregation for reports
- [ ] Create report data caching layer

## Phase 3: API Endpoints

- [ ] Create `/api/reports` - list/create report configs
- [ ] Create `/api/reports/[id]` - get/update/delete config
- [ ] Create `/api/reports/[id]/generate` - trigger report generation
- [ ] Create `/api/reports/[id]/download` - PDF download endpoint
- [ ] Add report generation to cron job system

## Phase 4: Email Delivery

- [ ] Create `lib/reports/email-template.tsx` - React Email template
- [ ] Integrate with notification system for delivery
- [ ] Add email preview functionality
- [ ] Implement delivery scheduling logic

## Phase 5: UI

- [ ] Create `/dashboard/reports` page
- [ ] Create `components/report-config-form.tsx`
- [ ] Create `components/report-viewer.tsx` - in-app report display
- [ ] Create `components/report-charts.tsx` - recharts visualizations
- [ ] Add report quick-view to dashboard

## Phase 6: PDF Export

- [ ] Integrate PDF generation library (react-pdf or puppeteer)
- [ ] Create PDF report template
- [ ] Implement async PDF generation with progress
- [ ] Add download button to report viewer
