#!/bin/bash
# Check commit message length
# Usage: ./commit-msg-length.sh <commit-msg-file>

set -e

COMMIT_MSG_FILE="$1"
MAX_SUBJECT_LENGTH=72
MAX_BODY_LINE_LENGTH=100

if [ -z "$COMMIT_MSG_FILE" ] || [ ! -f "$COMMIT_MSG_FILE" ]; then
    exit 0
fi

# Read first line (subject)
SUBJECT=$(head -1 "$COMMIT_MSG_FILE")
SUBJECT_LENGTH=${#SUBJECT}

if [ "$SUBJECT_LENGTH" -gt "$MAX_SUBJECT_LENGTH" ]; then
    echo ""
    echo "❌ Commit subject too long!"
    echo ""
    echo "Length: $SUBJECT_LENGTH characters (max: $MAX_SUBJECT_LENGTH)"
    echo "Subject: $SUBJECT"
    echo ""
    echo "Tips:"
    echo "  - Keep subject concise and descriptive"
    echo "  - Use imperative mood (\"add\" not \"added\")"
    echo "  - Put details in the commit body"
    echo ""
    exit 1
fi

# Check body line lengths (if body exists)
LINE_NUM=0
while IFS= read -r line; do
    LINE_NUM=$((LINE_NUM + 1))
    
    # Skip subject and blank line after it
    if [ "$LINE_NUM" -le 2 ]; then
        continue
    fi
    
    LINE_LENGTH=${#line}
    if [ "$LINE_LENGTH" -gt "$MAX_BODY_LINE_LENGTH" ]; then
        echo ""
        echo "⚠️  Commit body line $LINE_NUM too long ($LINE_LENGTH > $MAX_BODY_LINE_LENGTH)"
        echo "Consider wrapping at $MAX_BODY_LINE_LENGTH characters."
        # Warning only, don't fail
    fi
done < "$COMMIT_MSG_FILE"

exit 0
