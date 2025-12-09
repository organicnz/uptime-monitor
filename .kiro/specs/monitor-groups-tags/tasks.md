# Monitor Groups & Tags - Tasks

## Phase 1: Database Schema

- [ ] Create `monitor_groups` table migration
- [ ] Create `tags` table migration
- [ ] Create `monitor_tags` junction table migration
- [ ] Add `group_id` and `display_order` to monitors table
- [ ] Add RLS policies for new tables
- [ ] Update TypeScript types in `types/database.ts`

## Phase 2: Groups Backend

- [ ] Create `/api/groups` CRUD endpoints
- [ ] Create `lib/actions/groups.ts` server actions
- [ ] Implement group status aggregation logic
- [ ] Add group reordering endpoint
- [ ] Add monitor-to-group assignment endpoint

## Phase 3: Tags Backend

- [ ] Create `/api/tags` CRUD endpoints
- [ ] Create `lib/actions/tags.ts` server actions
- [ ] Implement tag assignment/removal for monitors
- [ ] Add bulk tag operations endpoint
- [ ] Create tag usage statistics query

## Phase 4: Dashboard UI

- [ ] Create `components/monitor-group.tsx` - collapsible group card
- [ ] Create `components/group-status-badge.tsx` - aggregated status
- [ ] Create `components/tag-badge.tsx` - colored tag display
- [ ] Create `components/tag-filter.tsx` - tag filter dropdown
- [ ] Add view toggle (flat/grouped) to dashboard
- [ ] Implement drag-and-drop with @dnd-kit

## Phase 5: Management UI

- [ ] Create `/dashboard/groups` management page
- [ ] Create `/dashboard/tags` management page
- [ ] Create `components/group-form.tsx` - create/edit group
- [ ] Create `components/tag-form.tsx` - create/edit tag with color picker
- [ ] Add group/tag selection to monitor form

## Phase 6: Status Page Integration

- [ ] Add group selector to status page form
- [ ] Update status page display to show groups
- [ ] Add group headers to public status page
- [ ] Implement tag-based monitor selection

## Phase 7: Polish

- [ ] Add keyboard shortcuts for filtering
- [ ] Persist view preferences in localStorage
- [ ] Add empty states for groups/tags
- [ ] Mobile-responsive group/tag UI
