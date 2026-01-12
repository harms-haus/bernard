#!/bin/bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

run_check() {
  local name="$1"
  local dir="$2"
  local cmd="$3"
  echo "=== $name ==="
  (cd "$ROOT/$dir" && npm run $cmd)
  if [ $? -ne 0 ]; then
    FAILED=1
    echo "$name FAILED"
  fi
  echo ""
}

run_check "Core Type Check" "core" "type-check"
run_check "Core Lint" "core" "lint"
run_check "Core Test" "core" "test"
run_check "Bernard-UI Type Check" "services/bernard-ui" "type-check"
run_check "Bernard-UI Lint" "services/bernard-ui" "lint"
run_check "Bernard-UI Test" "services/bernard-ui" "tests"

if [ $FAILED -eq 1 ]; then
  echo "❌ One or more checks failed"
  exit 1
else
  echo "✓ All checks passed"
  exit 0
fi
