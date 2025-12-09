# Lefthook Scripts

Enterprise-grade Git hooks for code quality and consistency.

## Setup

```bash
npx lefthook install
```

## Hooks Overview

### Pre-commit (runs on `git commit`)

| Check           | Description                   | Skip                 |
| --------------- | ----------------------------- | -------------------- |
| `typecheck`     | TypeScript type checking      | `SKIP=typecheck`     |
| `lint`          | ESLint with zero warnings     | `SKIP=lint`          |
| `format`        | Prettier formatting           | `SKIP=format`        |
| `no-debug`      | Blocks console.log, debugger  | `SKIP=no-debug`      |
| `secrets-check` | Detects potential credentials | `SKIP=secrets-check` |
| `json-validate` | Validates JSON syntax         | `SKIP=json-validate` |
| `file-size`     | Blocks files > 500KB          | `SKIP=file-size`     |

### Commit-msg (validates commit message)

| Check          | Description                          |
| -------------- | ------------------------------------ |
| `conventional` | Enforces conventional commits format |
| `length`       | Subject max 72 chars, body max 100   |

### Pre-push (runs on `git push`)

| Check            | Description             |
| ---------------- | ----------------------- |
| `typecheck-full` | Full TypeScript check   |
| `build`          | Production build test   |
| `branch-name`    | Validates branch naming |

### Post-checkout / Post-merge

Reminds you to run `npm install` when dependencies change.

## Skipping Hooks

```bash
# Skip all hooks
LEFTHOOK=0 git commit -m "emergency fix"

# Skip specific checks
LEFTHOOK_EXCLUDE=typecheck,lint git commit -m "wip"

# Skip with git flag
git commit --no-verify -m "wip"
```

## Conventional Commits

Format: `type(scope?): subject`

### Types

| Type       | Description             |
| ---------- | ----------------------- |
| `feat`     | New feature             |
| `fix`      | Bug fix                 |
| `docs`     | Documentation           |
| `style`    | Code style (formatting) |
| `refactor` | Code refactoring        |
| `perf`     | Performance improvement |
| `test`     | Tests                   |
| `chore`    | Maintenance             |
| `build`    | Build system            |
| `ci`       | CI/CD                   |
| `revert`   | Revert changes          |

### Examples

```bash
git commit -m "feat: add monitor grouping"
git commit -m "fix(auth): resolve session timeout"
git commit -m "docs: update API documentation"
```

## Branch Naming

Format: `type/description` or `type/TICKET-123-description`

### Types

- `feature/` - New features
- `fix/` - Bug fixes
- `hotfix/` - Critical fixes
- `release/` - Release prep
- `chore/` - Maintenance
- `docs/` - Documentation
- `refactor/` - Refactoring
- `test/` - Test updates

### Examples

```bash
git checkout -b feature/add-monitor-groups
git checkout -b fix/login-redirect
git checkout -b feature/PROJ-123-user-dashboard
```

## Troubleshooting

### Hooks not running?

```bash
npx lefthook install
```

### False positive on secrets?

Use environment variables or skip:

```bash
LEFTHOOK_EXCLUDE=secrets-check git commit -m "..."
```

### Need to bypass for emergency?

```bash
git commit --no-verify -m "hotfix: critical production fix"
```
