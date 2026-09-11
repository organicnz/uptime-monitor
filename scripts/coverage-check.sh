#!/usr/bin/env bash
# bun-coverage-check.sh
# Validates that Bun test coverage meets minimum thresholds.
# Run: bun run coverage-check
#
# Thresholds (project-wide baseline from current run):
#   - Functions: >= 70%
#   - Lines:     >= 80%
# These thresholds prevent coverage regression as the monitoring app grows.

set -euo pipefail

echo "🔎 Running Bun test suite with coverage..."
bun test --coverage > /dev/null 2>&1 || exit $?

echo "📊 Extracting project-wide coverage..."

# Parse the "All files" line from Bun's coverage output
# Format: "All files                               |   72.41 |   88.04 |"
PROJECT_LINE=$(bun test --coverage 2>&1 | grep "All files" | head -n 1)

if [ -z "$PROJECT_LINE" ]; then
  echo "❌ Could not find 'All files' in coverage output."
  exit 1
fi

# Extract funcs and lines percentages
PROJECT_FUNCS=$(echo "$PROJECT_LINE" | cut -d'|' -f2 | tr -d ' ')
PROJECT_LINES=$(echo "$PROJECT_LINE" | cut -d'|' -f3 | tr -d ' ')

echo "   Project functions: $PROJECT_FUNCS%"
echo "   Project lines:     $PROJECT_LINES%"

# Validate thresholds - these are project-wide baselines
# (include __tests__/setup.ts which is bootstrap-only)
MIN_FUNCS=70
MIN_LINES=80

FAIL=0
if (( $(echo "$PROJECT_FUNCS < $MIN_FUNCS" | bc -l) )); then
  echo "❌ Functions coverage $PROJECT_FUNCS% is below minimum $MIN_FUNCS% (baseline was 72.41%)"
  FAIL=1
fi

if (( $(echo "$PROJECT_LINES < $MIN_LINES" | bc -l) )); then
  echo "❌ Lines coverage $PROJECT_LINES% is below minimum $MIN_LINES% (baseline was 88.04%)"
  FAIL=1
fi

# Summary
if [ "$FAIL" -eq 0 ]; then
  echo "✅ Coverage thresholds satisfied: $PROJECT_FUNCS% functions, $PROJECT_LINES% lines"
  echo "   (Baseline from initial run: 72.41% funcs, 88.04% lines)"
  exit 0
else
  echo "⚠️  Coverage thresholds not met. Add more test coverage before committing."
  exit 1
fi
