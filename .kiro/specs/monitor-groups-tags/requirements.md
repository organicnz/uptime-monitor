# Monitor Groups & Tags

## Overview

Organize monitors using groups (hierarchical) and tags (flat labels) for better management at scale, matching Uptime Kuma's grouping capabilities.

## Requirements

### Functional Requirements

1. **Monitor Groups**
   - Create named groups to organize monitors
   - Nested groups (up to 2 levels deep)
   - Group-level status aggregation (UP if all UP, DOWN if any DOWN)
   - Collapsible group display in dashboard
   - Drag-and-drop reordering within groups

2. **Tags**
   - Create colored tags (label + color)
   - Assign multiple tags per monitor
   - Filter monitors by tag
   - Tag-based bulk operations
   - Tag usage statistics

3. **Dashboard Organization**
   - Toggle between flat list and grouped view
   - Filter by group, tag, or status
   - Persist view preferences per user
   - Group status summary cards

4. **Status Page Integration**
   - Add entire groups to status pages
   - Group display on public status pages
   - Tag-based monitor selection for status pages

### Non-Functional Requirements

- Support up to 50 groups per user
- Support up to 100 tags per user
- Group status calculation <100ms
- Drag-and-drop smooth at 60fps

## User Stories

- As a user, I want to group monitors by environment (prod, staging, dev)
- As a user, I want to tag monitors by service (api, web, database)
- As a user, I want to see aggregated status for each group
- As a user, I want to quickly filter to see only production monitors

## Out of Scope

- Group-level notification rules
- Tag inheritance from groups
- Shared groups between users
