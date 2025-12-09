#!/bin/bash
# Check if dependencies need updating after checkout
# Usage: ./deps-check.sh <previous-head> <new-head>

PREV_HEAD="$1"
NEW_HEAD="$2"

# Skip if not a branch checkout (file checkout)
if [ "$3" = "0" ]; then
    exit 0
fi

# Check if package.json changed
if git diff --name-only "$PREV_HEAD" "$NEW_HEAD" 2>/dev/null | grep -q "package.json"; then
    echo ""
    echo "📦 package.json changed!"
    echo "   Run 'npm install' to update dependencies."
    echo ""
fi

# Check if schema.sql changed
if git diff --name-only "$PREV_HEAD" "$NEW_HEAD" 2>/dev/null | grep -q "supabase/schema.sql"; then
    echo ""
    echo "🗄️  Database schema changed!"
    echo "   Review supabase/schema.sql for migration needs."
    echo ""
fi

# Check if .env.local.example changed
if git diff --name-only "$PREV_HEAD" "$NEW_HEAD" 2>/dev/null | grep -q ".env.local.example"; then
    echo ""
    echo "🔐 Environment variables changed!"
    echo "   Check .env.local.example for new required variables."
    echo ""
fi

exit 0
