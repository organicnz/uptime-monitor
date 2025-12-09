#!/bin/bash
# Validate JSON file syntax
# Usage: ./json-validate.sh file1.json file2.json ...

set -e

FILES="$@"
ERRORS=0

if [ -z "$FILES" ]; then
    exit 0
fi

for file in $FILES; do
    # Skip package-lock.json (too large, auto-generated)
    if [[ "$file" == *"package-lock.json"* ]]; then
        continue
    fi
    
    # Skip if file doesn't exist
    if [ ! -f "$file" ]; then
        continue
    fi
    
    # Validate JSON using Node.js (available in this project)
    if ! node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" 2>/dev/null; then
        echo "❌ Invalid JSON: $file"
        # Try to get more specific error
        node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))" 2>&1 | head -3
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Found $ERRORS invalid JSON file(s)."
    exit 1
fi

exit 0
