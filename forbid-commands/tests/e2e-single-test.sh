#!/bin/bash
# Single E2E test for forbid-commands
# Usage: ./e2e-single-test.sh "command" "expected"

set -e

COMMAND="$1"
EXPECTED="$2"
SESSION_NAME="forbid-e2e-test"
LOG_DIR="/var/home/l/git/pi-extensions/forbid-commands/test-logs"
LOG_FILE="$LOG_DIR/single-test-$(date +%Y%m%d-%H%M%S).log"
EXTENSION_PATH="/var/home/l/git/pi-extensions/forbid-commands/index.ts"

mkdir -p "$LOG_DIR"

echo "=== Single E2E Test ===" | tee -a "$LOG_FILE"
echo "Command: $COMMAND" | tee -a "$LOG_FILE"
echo "Expected: $EXPECTED" | tee -a "$LOG_FILE"
echo "Started at: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Clean up any existing session
shell-use --session "$SESSION_NAME" close 2>/dev/null || true

# Start a new session
echo "Starting shell-use session..." | tee -a "$LOG_FILE"
shell-use --session "$SESSION_NAME" open 2>&1 | tee -a "$LOG_FILE"

# Build the prompt
PROMPT="Run this exact command and tell me the result: $COMMAND"

echo "Running Pi with prompt: $PROMPT" | tee -a "$LOG_FILE"
echo "Model: openrouter/cohere/north-mini-code:free" | tee -a "$LOG_FILE"
echo "Extension: $EXTENSION_PATH" | tee -a "$LOG_FILE"

# Run Pi through shell-use with flags to disable other resources
# --no-extensions: disable extension discovery (but explicit -e still works)
# --no-skills: disable skills discovery
# --no-prompt-templates: disable prompt templates
# --no-themes: disable themes
# --no-approve: ignore project-local files
# --no-session: don't write session files
# --no-context-files: don't load AGENTS.md/CLAUDE.md
# --model: use free model from OpenRouter
shell-use --session "$SESSION_NAME" submit "pi --no-extensions --no-skills --no-prompt-templates --no-themes --no-approve --no-session --no-context-files --model openrouter/cohere/north-mini-code:free -e $EXTENSION_PATH -p '$PROMPT'" 2>&1 | tee -a "$LOG_FILE"

# Wait for Pi to respond (up to 60 seconds)
echo "Waiting for Pi response..." | tee -a "$LOG_FILE"
shell-use --session "$SESSION_NAME" wait text "Meee" --timeout 60000 2>&1 | tee -a "$LOG_FILE"

# Get the full output
OUTPUT=$(shell-use --session "$SESSION_NAME" text --full 2>&1)
echo "Full output:" | tee -a "$LOG_FILE"
echo "$OUTPUT" | tee -a "$LOG_FILE"

# Check result
if echo "$OUTPUT" | grep -qi "blocked\|denied\|forbidden\|Command blocked"; then
  ACTUAL="deny"
elif echo "$OUTPUT" | grep -qi "ask\|confirm"; then
  ACTUAL="ask"
else
  ACTUAL="allow"
fi

echo "" | tee -a "$LOG_FILE"
echo "Result: $ACTUAL" | tee -a "$LOG_FILE"

if [ "$ACTUAL" = "$EXPECTED" ]; then
  echo "Status: ✓ PASS" | tee -a "$LOG_FILE"
  RESULT=0
else
  echo "Status: ✗ FAIL" | tee -a "$LOG_FILE"
  RESULT=1
fi

# Save session recording
echo "" | tee -a "$LOG_FILE"
echo "Saving session recording..." | tee -a "$LOG_FILE"
shell-use --session "$SESSION_NAME" get-recording > "$LOG_DIR/single-test-$(date +%Y%m%d-%H%M%S).cast" 2>&1

# Close session
shell-use --session "$SESSION_NAME" close 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "Done! Check logs at: $LOG_FILE" | tee -a "$LOG_FILE"

exit $RESULT
