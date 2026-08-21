---
trigger: always_on
---

# Package Management Rule

- **Always use Bun:** Use `bun` for all package management commands instead of `npm`, `yarn`, or `pnpm`.
- Run `bun install` instead of `npm install`.
- Run `bun add <package>` instead of `npm install <package>`.
- Run `bun remove <package>` instead of `npm uninstall <package>`.
- Run `bun run <script>` instead of `npm run <script>`.
- Run `bunx <command>` instead of `npx <command>`.
- Never generate or use `package-lock.json`. Always rely on `bun.lockb`.
