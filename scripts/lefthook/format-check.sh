#!/bin/bash
# Format check script for lefthook pre-commit

set -e

FILES="$@"

if [ -z "$FILES" ]; then
    echo "No files to check"
    exit 0
fi

# Check if prettier is available
if ! command -v npx &> /dev/null; then
    echo "npx not found, skipping format check"
    exit 0
fi

echo "Checking format for: $FILES"
npx prettier --check $FILES
