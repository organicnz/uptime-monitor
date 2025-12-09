# Component Patterns

## UI Components (shadcn/ui)

Located in `components/ui/`:

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
```

Button variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

## Icons

Use `lucide-react`:

```typescript
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle, // Status
  Plus,
  Trash2,
  ArrowLeft,
  ArrowUpRight, // Actions
  Activity,
  Bell,
  Globe,
  Server,
  Zap,
  Shield, // Features
  Wifi,
  WifiOff, // Connection
} from "lucide-react";
```

## Toast Notifications

```typescript
import { toast } from "sonner";

toast.success("Monitor created");
toast.error("Failed to save");
```

## Styling Patterns

```tsx
import { cn } from "@/lib/utils";

// Status-based colors
const statusColors = {
  up: "text-green-400 bg-green-500/20",
  down: "text-red-400 bg-red-500/20",
  pending: "text-neutral-400 bg-neutral-500/20",
};

// Card pattern
<Card className="bg-neutral-900/50 border-neutral-800 hover:border-green-500/50 transition-all">

// Gradient text
<h1 className="bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">

// Conditional classes
<div className={cn("base-class", isActive && "active-class")} />
```

## Color Palette

- Grays: `neutral-*`
- Success/Primary: `green-*`
- Errors: `red-*`
- Dark mode is default
