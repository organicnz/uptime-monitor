# Monitor Groups & Tags - Design

## Database Schema

### monitor_groups

```sql
CREATE TABLE monitor_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES monitor_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  collapsed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_user_id ON monitor_groups(user_id);
CREATE INDEX idx_groups_parent_id ON monitor_groups(parent_id);

-- RLS
ALTER TABLE monitor_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own groups" ON monitor_groups
  FOR ALL USING (auth.uid() = user_id);
```

### tags

```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6b7280', -- neutral-500
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_tags_user_id ON tags(user_id);

-- RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tags" ON tags
  FOR ALL USING (auth.uid() = user_id);
```

### monitor_tags

```sql
CREATE TABLE monitor_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(monitor_id, tag_id)
);

CREATE INDEX idx_monitor_tags_monitor ON monitor_tags(monitor_id);
CREATE INDEX idx_monitor_tags_tag ON monitor_tags(tag_id);

-- RLS
ALTER TABLE monitor_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own monitor tags" ON monitor_tags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM monitors WHERE monitors.id = monitor_tags.monitor_id AND monitors.user_id = auth.uid())
  );
```

### Monitor Table Additions

```sql
ALTER TABLE monitors ADD COLUMN group_id UUID REFERENCES monitor_groups(id) ON DELETE SET NULL;
ALTER TABLE monitors ADD COLUMN display_order INTEGER DEFAULT 0;
CREATE INDEX idx_monitors_group_id ON monitors(group_id);
```

## Type Definitions

```typescript
// types/database.ts additions

export interface MonitorGroup {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  display_order: number;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface MonitorTag {
  id: string;
  monitor_id: string;
  tag_id: string;
  created_at: string;
}

// Extended types
export interface MonitorGroupWithStatus extends MonitorGroup {
  monitors: Monitor[];
  status: number; // Aggregated: DOWN if any DOWN
  children?: MonitorGroupWithStatus[];
}

export interface MonitorWithTags extends Monitor {
  tags: Tag[];
}
```

## Group Status Aggregation

```typescript
// lib/groups.ts

export function calculateGroupStatus(monitors: MonitorWithStatus[]): number {
  if (monitors.length === 0) return 2; // PENDING

  const hasDown = monitors.some((m) => m.status === 0);
  if (hasDown) return 0; // DOWN

  const hasMaintenance = monitors.some((m) => m.status === 3);
  if (hasMaintenance) return 3; // MAINTENANCE

  const hasPending = monitors.some((m) => m.status === 2);
  if (hasPending) return 2; // PENDING

  return 1; // UP
}
```

## UI Components

### MonitorGroup Component

```tsx
// components/monitor-group.tsx
"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { MonitorCard } from "./monitor-card";

export function MonitorGroup({ group, monitors, onToggle }: MonitorGroupProps) {
  const status = calculateGroupStatus(monitors);

  return (
    <div className="border border-neutral-800 rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="flex items-center gap-3">
          {group.collapsed ? <ChevronRight /> : <ChevronDown />}
          <GroupStatusBadge status={status} />
          <span className="font-medium">{group.name}</span>
          <span className="text-neutral-500">({monitors.length})</span>
        </div>
      </button>

      {!group.collapsed && (
        <div className="p-4 pt-0 space-y-2">
          {monitors.map((monitor) => (
            <MonitorCard key={monitor.id} monitor={monitor} compact />
          ))}
        </div>
      )}
    </div>
  );
}
```

### TagBadge Component

```tsx
// components/tag-badge.tsx

export function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
    >
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
```

### TagFilter Component

```tsx
// components/tag-filter.tsx
"use client";

export function TagFilter({ tags, selected, onChange }: TagFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => toggleTag(tag.id)}
          className={cn(
            "px-3 py-1 rounded-full text-sm transition-all",
            selected.includes(tag.id)
              ? "ring-2 ring-offset-2 ring-offset-neutral-900"
              : "opacity-60 hover:opacity-100",
          )}
          style={{ backgroundColor: `${tag.color}30`, color: tag.color }}
        >
          {tag.name}
        </button>
      ))}
    </div>
  );
}
```

## Dashboard View Modes

```typescript
// hooks/use-dashboard-view.ts

type ViewMode = "flat" | "grouped";
type SortBy = "name" | "status" | "created";

export function useDashboardView() {
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>(
    "dashboard-view",
    "flat",
  );
  const [sortBy, setSortBy] = useLocalStorage<SortBy>("dashboard-sort", "name");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  return {
    viewMode,
    setViewMode,
    sortBy,
    setSortBy,
    selectedTags,
    setSelectedTags,
    selectedGroup,
    setSelectedGroup,
  };
}
```

## Drag and Drop

Using `@dnd-kit/core` for reordering:

```tsx
// components/sortable-monitor-list.tsx
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

export function SortableMonitorList({ monitors, onReorder }) {
  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={monitors} strategy={verticalListSortingStrategy}>
        {monitors.map((monitor) => (
          <SortableMonitorCard key={monitor.id} monitor={monitor} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```
