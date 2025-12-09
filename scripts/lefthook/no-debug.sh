#!/bin/bash
# Check for debug statements that shouldn't be committed
# Usage: ./no-debug.sh file1.ts file2.tsx ...

set -e

FILES="$@"
ERRORS=0

if [ -z "$FILES" ]; then
    exit 0
fi

# Patterns to check (case insensitive where appropriate)
PATTERNS=(
    "console\.log\s*\("
    "console\.debug\s*\("
    "console\.warn\s*\("
    "console\.info\s*\("
    "debugger"
    "TODO.*REMOVE"
    "FIXME.*REMOVE"
    "XXX"
)

# Allowed patterns (won't trigger errors)
ALLOWED_FILES=(
    "*.test.ts"
    "*.test.tsx"
    "*.spec.ts"
    "*.spec.tsx"
)

for file in $FILES; do
    # Skip test files
    if [[ "$file" == *.test.* ]] || [[ "$file" == *.spec.* ]]; then
        continue
    fi
    
    # Skip if file doesn't exist (deleted files)
    if [ ! -f "$file" ]; then
        continue
    fi
    
    for pattern in "${PATTERNS[@]}"; do
        if grep -qE "$pattern" "$file" 2>/dev/null; then
            echo "⚠️  Found '$pattern' in: $file"
            grep -nE "$pattern" "$file" | head -3
            ERRORS=$((ERRORS + 1))
        fi
    done
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Found $ERRORS debug statement(s). Remove before committing."
    echo "Tip: Use proper logging instead of console.log"
    exit 1
fi

exit 0
