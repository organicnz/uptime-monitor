#!/bin/bash
# Validate commit message follows conventional commits format
# Usage: ./commit-msg.sh <commit-msg-file>

set -e

COMMIT_MSG_FILE="$1"

if [ -z "$COMMIT_MSG_FILE" ] || [ ! -f "$COMMIT_MSG_FILE" ]; then
    echo "Error: Commit message file not provided or doesn't exist"
    exit 1
fi

# Read first line (subject)
COMMIT_MSG=$(head -1 "$COMMIT_MSG_FILE")

# Skip merge commits
if [[ "$COMMIT_MSG" =~ ^Merge ]]; then
    exit 0
fi

# Skip revert commits
if [[ "$COMMIT_MSG" =~ ^Revert ]]; then
    exit 0
fi

# Conventional commit pattern
# type(scope?): subject
# Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci, revert
PATTERN="^(feat|fix|docs|style|refactor|perf|test|chore|build|ci|revert)(\([a-zA-Z0-9_-]+\))?: .{1,}"

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
    echo ""
    echo "❌ Invalid commit message format!"
    echo ""
    echo "Your message: $COMMIT_MSG"
    echo ""
    echo "Expected format: type(scope?): subject"
    echo ""
    echo "Valid types:"
    echo "  feat     - New feature"
    echo "  fix      - Bug fix"
    echo "  docs     - Documentation only"
    echo "  style    - Code style (formatting, semicolons, etc)"
    echo "  refactor - Code refactoring"
    echo "  perf     - Performance improvement"
    echo "  test     - Adding/updating tests"
    echo "  chore    - Maintenance tasks"
    echo "  build    - Build system changes"
    echo "  ci       - CI/CD changes"
    echo "  revert   - Reverting changes"
    echo ""
    echo "Examples:"
    echo "  feat: add monitor grouping feature"
    echo "  fix(auth): resolve session timeout issue"
    echo "  docs: update README with setup instructions"
    echo ""
    exit 1
fi

exit 0
