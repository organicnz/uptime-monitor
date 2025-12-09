#!/bin/bash
# Validate branch naming convention
# Usage: ./branch-name.sh

set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# Skip for main/master/develop branches
if [[ "$BRANCH" == "main" ]] || [[ "$BRANCH" == "master" ]] || [[ "$BRANCH" == "develop" ]]; then
    exit 0
fi

# Skip for HEAD (detached state)
if [[ "$BRANCH" == "HEAD" ]]; then
    exit 0
fi

# Branch naming pattern
# type/description or type/TICKET-123-description
# Types: feature, fix, hotfix, release, chore, docs, refactor, test
PATTERN="^(feature|fix|hotfix|release|chore|docs|refactor|test)/[a-z0-9]([a-z0-9-]*[a-z0-9])?$"

# Also allow ticket patterns like: feature/PROJ-123-description
TICKET_PATTERN="^(feature|fix|hotfix|release|chore|docs|refactor|test)/[A-Z]+-[0-9]+-[a-z0-9-]+$"

if ! echo "$BRANCH" | grep -qE "$PATTERN" && ! echo "$BRANCH" | grep -qE "$TICKET_PATTERN"; then
    echo ""
    echo "❌ Invalid branch name: $BRANCH"
    echo ""
    echo "Expected format: type/description"
    echo ""
    echo "Valid types:"
    echo "  feature  - New feature development"
    echo "  fix      - Bug fixes"
    echo "  hotfix   - Critical production fixes"
    echo "  release  - Release preparation"
    echo "  chore    - Maintenance tasks"
    echo "  docs     - Documentation updates"
    echo "  refactor - Code refactoring"
    echo "  test     - Test additions/updates"
    echo ""
    echo "Examples:"
    echo "  feature/add-monitor-groups"
    echo "  fix/login-redirect-issue"
    echo "  feature/PROJ-123-user-dashboard"
    echo ""
    echo "Rules:"
    echo "  - Use lowercase letters, numbers, and hyphens"
    echo "  - No spaces or special characters"
    echo "  - Keep it descriptive but concise"
    echo ""
    exit 1
fi

exit 0
