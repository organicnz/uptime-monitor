#!/bin/bash
# Format check script for lefthook pre-commit
# Usage: ./format-check.sh file1.ts file2.tsx ...

set -e

FILES="$@"

if [ -z "$FILES" ]; then
    echo "✓ No files to check"
    exit 0
fi

# Check if prettier is available
if ! command -v npx &> /dev/null; then
    echo "⚠️  npx not found, skipping format check"
    exit 0
fi

# Count files
FILE_COUNT=$(echo "$FILES" | wc -w | tr -d ' ')
echo "🔍 Checking format for $FILE_COUNT file(s)..."

# Run prettier check
if npx prettier --check $FILES 2>/dev/null; then
    echo "✓ All files formatted correctly"
    exit 0
else
    echo ""
    echo "❌ Formatting issues found!"
    echo ""
    echo "To fix, run:"
    echo "  npx prettier --write ."
    echo ""
    echo "Or fix specific files:"
    echo "  npx prettier --write $FILES"
    exit 1
fi
