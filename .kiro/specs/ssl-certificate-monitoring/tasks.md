# SSL Certificate Monitoring - Tasks

## Phase 1: Database Schema

- [ ] Create `ssl_certificates` table migration
- [ ] Add `ssl_check_enabled` boolean to monitors table
- [ ] Add `ssl_warning_days` array to monitors table
- [ ] Update database types in `types/database.ts`

## Phase 2: Certificate Extraction

- [ ] Create `lib/ssl-checker.ts` with certificate extraction logic
- [ ] Integrate SSL check into `lib/monitor-checker.ts` for HTTPS monitors
- [ ] Store/update certificate data after each check
- [ ] Handle certificate chain validation

## Phase 3: Notifications

- [ ] Create `lib/ssl-notifications.ts` for expiration alerts
- [ ] Add SSL notification preferences to notification channels
- [ ] Implement threshold-based notification logic
- [ ] Add "ssl_expiring" notification type

## Phase 4: Dashboard UI

- [ ] Create `/dashboard/certificates` page
- [ ] Create `components/certificate-list.tsx` component
- [ ] Create `components/certificate-card.tsx` with expiration indicator
- [ ] Add certificate details modal/drawer
- [ ] Add SSL status to monitor detail page

## Phase 5: Polish

- [ ] Add certificate expiration to status pages (optional display)
- [ ] Create certificate health summary widget for dashboard
- [ ] Add bulk certificate export (CSV)
- [ ] Document SSL monitoring feature
