# Uptime Reports

## Overview

Generate and deliver periodic uptime reports summarizing monitor performance, incidents, and trends over configurable time periods.

## Requirements

### Functional Requirements

1. **Report Generation**
   - Daily, weekly, and monthly report options
   - Per-monitor and aggregate statistics
   - Uptime percentage, average response time, incident count
   - Comparison with previous period

2. **Report Delivery**
   - Email delivery to configured addresses
   - In-app report viewer
   - PDF export option
   - Scheduled delivery (configurable time/day)

3. **Report Content**
   - Executive summary with key metrics
   - Per-monitor breakdown table
   - Response time trend chart
   - Incident timeline
   - SLA compliance status (if configured)

4. **Report Configuration**
   - Select monitors to include
   - Choose metrics to display
   - Set delivery schedule
   - Configure recipient list

### Non-Functional Requirements

- Reports generated within 60 seconds
- PDF generation under 10 seconds
- Report data retained for 1 year
- Support up to 100 monitors per report

## User Stories

- As a user, I want weekly uptime reports emailed to my team
- As a user, I want to see month-over-month performance trends
- As a user, I want to export reports for stakeholder meetings

## Out of Scope

- Custom report templates
- White-label branding
- Real-time report streaming
