#!/bin/bash
# Check that staged files aren't too large
# Usage: ./file-size-check.sh file1.ts file2.tsx ...

set -e

FILES="$@"
MAX_SIZE_KB=500
ERRORS=0

if [ -z "$FILES" ]; then
    exit 0
fi

# File types to check (source files only)
CHECK_EXTENSIONS="ts tsx js jsx json css md yml yaml"

for file in $FILES; do
    # Skip if file doesn't exist
    if [ ! -f "$file" ]; then
        continue
    fi
    
    # Get file extension
    ext="${file##*.}"
    
    # Only check source files
    should_check=false
    for check_ext in $CHECK_EXTENSIONS; do
        if [ "$ext" = "$check_ext" ]; then
            should_check=true
            break
        fi
    done
    
    if [ "$should_check" = false ]; then
        continue
    fi
    
    # Get file size in KB
    if [[ "$OSTYPE" == "darwin"* ]]; then
        SIZE_KB=$(stat -f%z "$file" 2>/dev/null | awk '{print int($1/1024)}')
    else
        SIZE_KB=$(stat --printf="%s" "$file" 2>/dev/null | awk '{print int($1/1024)}')
    fi
    
    if [ "$SIZE_KB" -gt "$MAX_SIZE_KB" ]; then
        echo "📦 File too large: $file (${SIZE_KB}KB > ${MAX_SIZE_KB}KB)"
        ERRORS=$((ERRORS + 1))
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Found $ERRORS file(s) exceeding ${MAX_SIZE_KB}KB limit."
    echo "Consider splitting large files or using lazy loading."
    exit 1
fi

exit 0
