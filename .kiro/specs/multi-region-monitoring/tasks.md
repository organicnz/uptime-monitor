# Multi-Region Monitoring - Tasks

## Phase 1: Database & Types

- [ ] Add migration for `heartbeats.region` column
- [ ] Add migration for `monitors.check_regions` array column
- [ ] Add migration for `monitors.region_strategy` column
- [ ] Update `types/database.ts` with new fields
- [ ] Update `types/application.ts` with Region and RegionStrategy types

## Phase 2: Backend Logic

- [ ] Create `lib/regions.ts` with region constants and helpers
- [ ] Update `lib/monitor-checker.ts` to accept region parameter
- [ ] Modify `/api/cron/check-monitors` to handle multi-region checks
- [ ] Implement region strategy aggregation logic
- [ ] Create `/api/monitors/[id]/regional-stats` endpoint

## Phase 3: UI Components

- [ ] Create `components/region-select.tsx` multi-select component
- [ ] Add region fields to monitor create/edit form
- [ ] Create `components/regional-latency-chart.tsx` using recharts
- [ ] Add regional status indicators to monitor detail page
- [ ] Update dashboard to show regional breakdown

## Phase 4: Testing & Polish

- [ ] Add region selection to monitor form validation (zod)
- [ ] Test backward compatibility with existing monitors
- [ ] Add loading states for regional analytics
- [ ] Document multi-region feature in README
