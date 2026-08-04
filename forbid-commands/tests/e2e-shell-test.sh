#!/bin/bash
# E2E Test for forbid-commands using shell-use
# This script runs commands through Pi one by one and logs everything

set -e

LOG_DIR="/var/home/l/git/pi-extensions/forbid-commands/test-logs"
LOG_FILE="$LOG_DIR/e2e-test-$(date +%Y%m%d-%H%M%S).log"
SESSION_NAME="forbid-e2e"

# Create log directory
mkdir -p "$LOG_DIR"

# Test cases: command, expected result
declare -a TESTS=(
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

echo "=== forbid-commands E2E Test (shell-use) ===" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Clean up any existing session
shell-use --session "$SESSION_NAME" close 2>/dev/null || true

# Start a new session
echo "Starting shell-use session..." | tee -a "$LOG_FILE"
shell-use --session "$SESSION_NAME" open 2>&1 | tee -a "$LOG_FILE"

passed=0
failed=0
total=${#TESTS[@]}

for i in "${!TESTS[@]}"; do
  IFS='|' read -r COMMAND EXPECTED <<< "${TESTS[$i]}"
  
  echo "" | tee -a "$LOG_FILE"
  echo "Test $((i+1))/$total: $COMMAND" | tee -a "$LOG_FILE"
  echo "  Expected: $EXPECTED" | tee -a "$LOG_FILE"
  
  # Log the Pi session ID when we run Pi
  echo "  Running Pi..." | tee -a "$LOG_FILE"
  
  # Build the prompt
  PROMPT="Run this exact command and tell me the result: $COMMAND"
  
  # Run Pi through shell-use
  shell-use --session "$SESSION_NAME" submit "timeout 30 pi -p '$PROMPT'" 2>&1 | tee -a "$LOG_FILE"
  
  # Wait for command to finish
  shell-use --session "$SESSION_NAME" wait command --timeout 35000 2>&1 | tee -a "$LOG_FILE"
  
  # Get the output
  OUTPUT=$(shell-use --session "$SESSION_NAME" text --full 2>&1)
  echo "  Output:" | tee -a "$LOG_FILE"
  echo "$OUTPUT" | tee -a "$LOG_FILE"
  
  # Check result
  if echo "$OUTPUT" | grep -qi "blocked\|denied\|forbidden"; then
    ACTUAL="deny"
  elif echo "$OUTPUT" | grep -qi "ask\|confirm"; then
    ACTUAL="ask"
  else
    ACTUAL="allow"
  fi
  
  echo "  Actual: $ACTUAL" | tee -a "$LOG_FILE"
  
  if [ "$ACTUAL" = "$EXPECTED" ]; then
    echo "  Status: ✓ PASS" | tee -a "$LOG_FILE"
    passed=$((passed + 1))
  else
    echo "  Status: ✗ FAIL" | tee -a "$LOG_FILE"
    failed=$((failed + 1))
  fi
  
  # Small delay between tests
  sleep 1
done

echo "" | tee -a "$LOG_FILE"
echo "=== Summary ===" | tee -a "$LOG_FILE"
echo "Total: $total" | tee -a "$LOG_FILE"
echo "Passed: $passed" | tee -a "$LOG_FILE"
echo "Failed: $failed" | tee -a "$LOG_FILE"
echo "Completed at: $(date)" | tee -a "$LOG_FILE"

# Save session recording
echo "" | tee -a "$LOG_FILE"
echo "Saving session recording..." | tee -a "$LOG_FILE"
shell-use --session "$SESSION_NAME" get-recording > "$LOG_DIR/session-$(date +%Y%m%d-%H%M%S).cast" 2>&1

# Close session
shell-use --session "$SESSION_NAME" close 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Done! Check logs at: $LOG_FILE" | tee -a "$LOG_FILE"

exit $failed
