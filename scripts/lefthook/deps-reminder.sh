#!/bin/bash
# Remind to update dependencies after merge
# Usage: ./deps-reminder.sh

# Check if package.json was in the merge
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "package.json"; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  📦 Dependencies may have changed!                         ║"
    echo "║                                                            ║"
    echo "║  Run: npm install                                          ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
fi

# Check if schema changed
if git diff --name-only HEAD@{1} HEAD 2>/dev/null | grep -q "supabase/"; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║  🗄️  Database schema may have changed!                      ║"
    echo "║                                                            ║"
    echo "║  Review: supabase/schema.sql                               ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
fi

exit 0
