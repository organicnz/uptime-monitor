# Multi-Region Monitoring - Design

## Database Changes

### New Column: heartbeats.region

```sql
ALTER TABLE heartbeats ADD COLUMN region TEXT DEFAULT 'us-east-1';
CREATE INDEX idx_heartbeats_region ON heartbeats(region);
```

### New Column: monitors.check_regions

```sql
ALTER TABLE monitors ADD COLUMN check_regions TEXT[] DEFAULT ARRAY['us-east-1'];
ALTER TABLE monitors ADD COLUMN region_strategy TEXT DEFAULT 'any_down'
  CHECK (region_strategy IN ('any_down', 'majority_down', 'all_down'));
```

## Type Updates

```typescript
// types/database.ts additions
type Region = 'us-east-1' | 'us-west-2' | 'eu-west-1' | 'eu-central-1' | 'ap-southeast-1';
type RegionStrategy = 'any_down' | 'majority_down' | 'all_down';

// Monitor type extension
check_regions: Region[];
region_strategy: RegionStrategy;

// Heartbeat type extension
region: Region;
```

## API Changes

### Cron Job Enhancement

The `/api/cron/check-monitors` endpoint will:

1. Query monitors with their `check_regions` array
2. For each monitor, spawn checks for each configured region
3. Each regional check creates its own heartbeat record
4. After all regional checks complete, compute aggregated status

### New Endpoint: Regional Analytics

```
GET /api/monitors/[id]/regional-stats
Response: {
  regions: {
    [region]: {
      avgLatency: number;
      uptime: number;
      lastCheck: string;
    }
  }
}
```

## Component Changes

### MonitorForm

- Add multi-select for check regions
- Add dropdown for region strategy
- Show estimated check distribution

### MonitorDetail

- Add regional latency chart (recharts)
- Show per-region status indicators
- Regional uptime breakdown

## Edge Function Architecture

For true multi-region checks, deploy Vercel Edge Functions:

- `api/check/[region]/route.ts` - Region-specific check endpoint
- Each function deployed to specific Vercel region
- Main cron orchestrates calls to regional endpoints
