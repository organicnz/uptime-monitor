---
trigger: always_on
---

# Git Workflow & Standards

## Conventional Commits

All commit messages must follow the Conventional Commits specification.

- **Format:** `type(scope?): subject`
- **Types:** `feat` (new feature), `fix` (bug fix), `chore` (maintenance), `docs` (documentation), `style` (formatting), `refactor` (code restructuring), `test` (adding tests).
- **Example:** `feat(monitors): add response time chart`
- **Limit:** Keep the subject line under 72 characters.

## Branch Naming Conventions

Use descriptive, standard branch names.

- **Format:** `type/description` or `type/TICKET-ID-description`
- **Types:** `feature`, `fix`, `hotfix`, `chore`, `docs`
- **Example:** `feature/add-slack-notifications`

## Lefthook Enforcement

- Never bypass Git hooks (`--no-verify`) unless in an absolute emergency.
- Lefthook is configured to run formatting, linting, and type checking on staged files. Ensure all code passes these checks before pushing to the remote repository.
