#!/bin/bash
# Run all E2E tests sequentially using single-test.sh

TESTS=(
  "echo hello|allow"
  "ls /tmp|allow"
  "git status|allow"
  "sudo ls /tmp|deny"
  "kill 1234|deny"
  "shutdown -h now|deny"
  "reboot|deny"
  "pkill brave|deny"
  "ssh user@host|deny"
  "/usr/bin/sudo ls|deny"
  "/usr/bin/kill 1234|deny"
  "\"sudo\" ls|deny"
  "'kill' 1234|deny"
)

echo "=== Running all E2E tests ==="
echo "Total tests: ${#TESTS[@]}"
echo ""

passed=0
failed=0

for i in "${!TESTS[@]}"; do
  IFS='|' read -r COMMAND EXPECTED <<< "${TESTS[$i]}"
  
  echo "--- Test $((i+1))/${#TESTS[@]} ---"
  
  if ./tests/e2e-single-test.sh "$COMMAND" "$EXPECTED"; then
    ((passed++))
  else
    ((failed++))
  fi
  
  echo ""
done

echo "=== Summary ==="
echo "Total: ${#TESTS[@]}"
echo "Passed: $passed"
echo "Failed: $failed"

exit $failed
