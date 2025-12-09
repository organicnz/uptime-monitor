# Component Patterns

## UI Components (shadcn/ui)

Located in `components/ui/`. Use these as building blocks:

- `Button` - with variants: default, destructive, outline, secondary, ghost, link
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Input`, `Label`, `Textarea`, `Switch`
- `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`
- `AlertDialog` - for destructive confirmations

## Feature Components

Located in `components/`. Domain-specific components:

- `LiveMonitorsList` - Grid of monitors with realtime status
- `RealtimeStatus` - Single monitor status indicator
- `StatusPageForm` - Create/edit status page form
- `ThemeToggle` - Dark/light mode switcher

## Component Structure

```tsx
// Client component with realtime
"use client";

import { useRealtimeMonitors } from "@/hooks/use-realtime-monitors";
import { Card, CardContent } from "@/components/ui/card";

export function MyComponent({ data }: Props) {
  const { statuses, isConnected } = useRealtimeMonitors(ids);
  // ...
}
```

## Icons

Use `lucide-react`. Common icons in this project:

- Status: `CheckCircle2`, `XCircle`, `AlertCircle`, `AlertTriangle`
- Actions: `Plus`, `Trash2`, `ArrowLeft`, `ArrowUpRight`
- Features: `Activity`, `Bell`, `Globe`, `Server`, `Zap`, `Shield`
- Connection: `Wifi`, `WifiOff`

## Styling Patterns

```tsx
// Status-based styling
const statusColors = {
  up: "text-green-400 bg-green-500/20",
  down: "text-red-400 bg-red-500/20",
  pending: "text-neutral-400 bg-neutral-500/20",
};

// Card with hover effect
<Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 transition-all">

// Gradient text
<h1 className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
```
