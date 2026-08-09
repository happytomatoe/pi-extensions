#!/bin/bash
# E2E Test with Pi and forbid-commands extension
# Uses pi -p (print mode) for non-interactive testing
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== E2E Test with Pi and forbid-commands extension ==="
echo ""

# Setup test directory structure
echo "1. Setting up test directory structure..."
TEST_DIR="$SCRIPT_DIR/test-e2e"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR/data/files" "$TEST_DIR/test-folder"
echo "test" > "$TEST_DIR/target.txt"
echo "test" > "$TEST_DIR/data/files/test.txt"
echo "test" > "$TEST_DIR/relative-file.txt"
mkdir -p /tmp/test-e2e /tmp/test-e2e-folder
echo "test" > /tmp/test-e2e/tmp-file.txt
echo "test" > "$SCRIPT_DIR/../parent-file.txt"
echo "   Created:"
echo "   - $TEST_DIR/target.txt (file)"
echo "   - $TEST_DIR/data/files/test.txt (file)"
echo "   - $TEST_DIR/relative-file.txt (file - for denied test)"
echo "   - $TEST_DIR/test-folder/ (folder)"
echo "   - /tmp/test-e2e/tmp-file.txt (file)"
echo "   - /tmp/test-e2e-folder/ (folder)"
echo "   - $SCRIPT_DIR/../parent-file.txt (file)"
echo ""

# Test cases
echo "2. Test cases:"
echo ""
echo "   | # | Command                              | Expected |"
echo "   |---|--------------------------------------|----------|"
echo "   | 1 | rm ./target.txt                      | ALLOW    |"
echo "   | 2 | rm ./data/files/test.txt             | ALLOW    |"
echo "   | 3 | rm /tmp/test-e2e/tmp-file.txt        | ALLOW    |"
echo "   | 4 | rm ../parent-file.txt                | DENY     |"
echo "   | 5 | rm relative-file.txt (no ./)         | DENY     |"
echo "   | 6 | rm -rf ./test-folder                 | ALLOW    |"
echo "   | 7 | rm -rf /tmp/test-e2e-folder          | ALLOW    |"
echo ""

# Run test with pi -p
echo "3. Running test with Pi (print mode)..."
echo ""

cd "$TEST_DIR"

OUTPUT=$(pi -p -ne --approve -ns -e ../index.ts --model openrouter/free "Remove these files and directories. Make ALL rm commands as separate parallel tool calls (not sequential):

Files to remove:
- ./target.txt
- ./data/files/test.txt  
- /tmp/test-e2e/tmp-file.txt
- ../parent-file.txt
- relative-file.txt
- ./test-folder (use rm -rf)
- /tmp/test-e2e-folder (use rm -rf)

Execute all 7 rm commands simultaneously as parallel bash tool calls. Then report which ones were allowed and which were blocked.

Finally, run this command and output the result: echo \"PI_SESSION_FILE=\$PI_SESSION_FILE\"" 2>&1)

echo "$OUTPUT"
echo ""

# Save output to file
echo "$OUTPUT" > "$SCRIPT_DIR/pi-e2e-output.txt"
echo "4. Output saved to: pi-e2e-output.txt"
echo ""

# Copy the Pi session JSONL for troubleshooting
echo "6. Copying Pi session file..."

# Extract session file path from LLM output
SESSION_FILE_PATH=$(echo "$OUTPUT" | grep -oP 'PI_SESSION_FILE=\K[^\s]+' | head -1)

if [ -n "$SESSION_FILE_PATH" ] && [ -f "$SESSION_FILE_PATH" ]; then
    cp "$SESSION_FILE_PATH" "$SCRIPT_DIR/pi-e2e-session.jsonl"
    echo "   Session file copied to: pi-e2e-session.jsonl"
    echo "   Original: $SESSION_FILE_PATH"
else
    echo "   Session file not found in output"
    echo "   Output contained: $(echo "$OUTPUT" | grep SESSION_FILE || echo 'no SESSION_FILE line')"
fi
echo ""

# Check results
echo "5. Checking results..."
echo ""

test_result() {
    local path="$1"
    local expected="$2"
    local test_name="$3"
    local is_dir="$4"
    
    local exists=false
    if [ "$is_dir" = "true" ]; then
        [ -d "$path" ] && exists=true
    else
        [ -f "$path" ] && exists=true
    fi
    
    if $exists; then
        if [ "$expected" = "keep" ]; then
            echo -e "   ${GREEN}PASS${NC}: $test_name - Path still exists (correctly blocked)"
            return 0
        else
            echo -e "   ${RED}FAIL${NC}: $test_name - Path still exists (should have been deleted)"
            return 1
        fi
    else
        if [ "$expected" = "delete" ]; then
            echo -e "   ${GREEN}PASS${NC}: $test_name - Path deleted (correctly allowed)"
            return 0
        else
            echo -e "   ${RED}FAIL${NC}: $test_name - Path deleted (should have been blocked)"
            return 1
        fi
    fi
}

total=0
passed=0
failed=0

# Check file state after LLM executed commands
if test_result "$TEST_DIR/target.txt" "delete" "rm ./target.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$TEST_DIR/data/files/test.txt" "delete" "rm ./data/files/test.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "/tmp/test-e2e/tmp-file.txt" "delete" "rm /tmp/test-e2e/tmp-file.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$SCRIPT_DIR/../parent-file.txt" "keep" "rm ../parent-file.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$TEST_DIR/relative-file.txt" "keep" "rm relative-file.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$TEST_DIR/test-folder" "delete" "rm -rf ./test-folder" true; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "/tmp/test-e2e-folder" "delete" "rm -rf /tmp/test-e2e-folder" true; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

# Summary
echo ""
echo "==========================================="
echo -e "${YELLOW}Test Summary${NC}"
echo "==========================================="
echo "Total:  $total"
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo ""

# Cleanup
echo "Cleaning up..."
rm -rf "$TEST_DIR" /tmp/test-e2e /tmp/test-e2e-folder "$SCRIPT_DIR/../parent-file.txt"

echo ""

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
