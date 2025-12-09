# Multi-Region Monitoring

## Overview

Enable monitors to be checked from multiple geographic regions to provide more accurate uptime data and detect regional outages.

## Requirements

### Functional Requirements

1. **Region Selection**
   - Users can select one or more check regions per monitor
   - Available regions: US-East, US-West, EU-West, EU-Central, Asia-Pacific
   - Default to single region (current behavior) for backward compatibility

2. **Regional Heartbeats**
   - Each check records which region performed the check
   - Heartbeats table extended with `region` column
   - Regional response times tracked separately

3. **Aggregated Status**
   - Monitor status determined by configurable logic:
     - "Any Down" - DOWN if any region fails
     - "Majority Down" - DOWN if >50% of regions fail
     - "All Down" - DOWN only if all regions fail
   - User configurable per monitor

4. **Regional Analytics**
   - Dashboard shows per-region response times
   - Latency comparison chart across regions
   - Regional uptime percentages

### Non-Functional Requirements

- Regional checks should not increase total check frequency
- Checks distributed across regions within the interval
- Maximum 500ms additional latency for multi-region aggregation

## User Stories

- As a user, I want to monitor my API from multiple regions so I can detect regional outages
- As a user, I want to see which regions have the best response times
- As a user, I want to configure how regional failures affect overall status

## Out of Scope

- Custom/private check regions
- Region-specific notification routing
- Geographic load balancing recommendations
