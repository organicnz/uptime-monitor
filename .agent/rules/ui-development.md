---
trigger: always_on
---

# UI Development & Tailwind CSS v4 Guidelines

## Tailwind CSS v4 Usage

1. **Zero Configuration (mostly):** Rely on Tailwind v4's modern CSS variables approach. Avoid creating a `tailwind.config.js` file unless strictly necessary for complex custom plugins.
2. **Theme Configuration:** Define theme tokens (colors, fonts, spacing) directly in `app/globals.css` using standard CSS variables and the `@theme` directive.
3. **Modern CSS:** Utilize modern CSS features like CSS grid, logical properties, and container queries.

## Shadcn UI Integration

1. **Component Scaffolding:** Always use the Shadcn CLI to add new components (using `bunx shadcn add [component]`). Do not manually copy-paste if a CLI option is available.
2. **Customization:** Treat Shadcn components as a starting point. Customize their internal Tailwind classes to match our premium aesthetic directly in the `components/ui` files.
3. **Icons:** Use `lucide-react` for all iconography to ensure visual consistency with Shadcn UI.

## Aesthetics & Motion

- Maintain a premium, high-quality aesthetic (e.g., "Liquid Glass", subtle glows, sophisticated dark mode).
- Employ subtle micro-animations (e.g., hover effects, layout transitions) using Tailwind utility classes or `framer-motion` if required for complex state transitions.
