#!/bin/bash
# Check for potential secrets/credentials in staged files
# Usage: ./secrets-check.sh file1.ts file2.json ...

set -e

FILES="$@"
ERRORS=0

if [ -z "$FILES" ]; then
    exit 0
fi

# Patterns that might indicate secrets
SECRET_PATTERNS=(
    # API keys and tokens
    "api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]"
    "api[_-]?secret\s*[:=]\s*['\"][a-zA-Z0-9]"
    "access[_-]?token\s*[:=]\s*['\"][a-zA-Z0-9]"
    "auth[_-]?token\s*[:=]\s*['\"][a-zA-Z0-9]"
    "bearer\s+[a-zA-Z0-9_-]{20,}"

    # AWS
    "AKIA[0-9A-Z]{16}"
    "aws[_-]?secret"

    # Supabase tokens and JWTs
    "sbp_[a-zA-Z0-9]{30,}"
    "sb_secret_[a-zA-Z0-9_-]{20,}"
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\."

    # QStash/Upstash tokens
    "QSTASH_TOKEN\s*[:=]\s*['\"]eyJ"
    "sig_[a-zA-Z0-9]{20,}"

    # Private keys
    "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
    "-----BEGIN PGP PRIVATE KEY BLOCK-----"

    # Passwords
    "password\s*[:=]\s*['\"][^'\"]{8,}"

    # Database URLs with credentials
    "postgres://[^:]+:[^@]+@"
    "mysql://[^:]+:[^@]+@"
    "mongodb://[^:]+:[^@]+@"

    # Generic secrets
    "secret[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]"
)

# Files to skip
SKIP_PATTERNS=(
    "*.example"
    "*.sample"
    "*.md"
    "*.lock"
)

for file in $FILES; do
    # Skip example/sample files
    if [[ "$file" == *.example ]] || [[ "$file" == *.sample ]]; then
        continue
    fi
    
    # Skip if file doesn't exist
    if [ ! -f "$file" ]; then
        continue
    fi
    
    for pattern in "${SECRET_PATTERNS[@]}"; do
        if grep -qiE "$pattern" "$file" 2>/dev/null; then
            # Check if it's just an env var reference
            MATCH=$(grep -iE "$pattern" "$file" | head -1)
            if [[ "$MATCH" == *"process.env"* ]] || [[ "$MATCH" == *"NEXT_PUBLIC_"* ]]; then
                continue
            fi
            
            echo "🔐 Potential secret in: $file"
            echo "   Pattern: $pattern"
            grep -niE "$pattern" "$file" | head -2 | sed 's/^/   /'
            ERRORS=$((ERRORS + 1))
        fi
    done
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "⚠️  Found $ERRORS potential secret(s)!"
    echo ""
    echo "If these are false positives, you can:"
    echo "  1. Use environment variables instead"
    echo "  2. Add to .gitignore"
    echo "  3. Skip with: LEFTHOOK=0 git commit ..."
    exit 1
fi

exit 0
