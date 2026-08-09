#!/bin/bash
# E2E Test with Pi and forbid-commands extension
# Supports both shell-use (default) and herdr (--herdr flag)
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse flags
USE_HERDR=false
for arg in "$@"; do
    case $arg in
        --herdr)
            USE_HERDR=true
            shift
            ;;
    esac
done

echo "=== E2E Test with Pi and forbid-commands extension ==="
echo "Mode: $([ "$USE_HERDR" = true ] && echo "herdr" || echo "shell-use")"
echo ""

# Check if using herdr and if we're in herdr
if [ "$USE_HERDR" = true ] && [ "${HERDR_ENV:-}" != "1" ]; then
    echo "ERROR: --herdr flag requires running inside Herdr"
    echo "Run: herdr session create pi-e2e-test"
    exit 1
fi

# Setup test directory structure
echo "1. Setting up test directory structure..."
TEST_DIR="$SCRIPT_DIR/test-e2e"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR/data/files" "$TEST_DIR/test-folder"
echo "test" > "$TEST_DIR/target.txt"
echo "test" > "$TEST_DIR/data/files/test.txt"
mkdir -p /tmp/test-e2e /tmp/test-e2e-folder
echo "test" > /tmp/test-e2e/tmp-file.txt
echo "test" > "$SCRIPT_DIR/../parent-file.txt"
echo "   Created:"
echo "   - $TEST_DIR/target.txt (file)"
echo "   - $TEST_DIR/data/files/test.txt (file)"
echo "   - $TEST_DIR/test-folder/ (folder)"
echo "   - /tmp/test-e2e/tmp-file.txt (file)"
echo "   - /tmp/test-e2e-folder/ (folder)"
echo "   - $SCRIPT_DIR/../parent-file.txt (file)"
echo ""

# Test cases
echo "2. Test cases to run with Pi:"
echo ""
echo "   | # | Command                              | Expected |"
echo "   |---|--------------------------------------|----------|"
echo "   | 1 | rm ./target.txt                      | ALLOW    |"
echo "   | 2 | rm ./data/files/test.txt             | ALLOW    |"
echo "   | 3 | rm /tmp/test-e2e/tmp-file.txt        | ALLOW    |"
echo "   | 4 | rm ../parent-file.txt                | DENY     |"
echo "   | 5 | rm data/files/test.txt (no ./)       | DENY     |"
echo "   | 6 | rm -rf ./test-folder                 | ALLOW    |"
echo "   | 7 | rm -rf /tmp/test-e2e-folder          | ALLOW    |"
echo ""

# Function to send command based on mode
send_test() {
    local prompt="$1"
    local timeout="${2:-60000}"
    local test_num="$3"
    
    echo "   Test $test_num: Sending prompt..."
    
    if [ "$USE_HERDR" = true ]; then
        herdr agent prompt "$TEST_PANE" "$prompt" --wait --timeout "$timeout" 2>/dev/null || true
    else
        shell-use submit "$prompt" --session pi-e2e-test
        shell-use wait idle --session pi-e2e-test --timeout "$timeout"
    fi
    
    # Wait a bit for execution
    sleep 2
}

# Setup based on mode
if [ "$USE_HERDR" = true ]; then
    echo "3. Creating test pane..."
    TEST_PANE_RESULT=$(herdr pane split --current --direction right --cwd "$TEST_DIR" --no-focus 2>&1)
    TEST_PANE=$(echo "$TEST_PANE_RESULT" | jq -r '.result.pane.pane_id')
    echo "   Test pane: $TEST_PANE"
    
    # Start Pi in the test pane
    echo "4. Starting Pi in test directory..."
    herdr pane run "$TEST_PANE" "pi -ne --approve -ns -e ../index.ts" 2>/dev/null
    sleep 5
    
    # Reload extension config
    echo "   Reloading extension config..."
    send_test "/reload" 10000 0
else
    echo "3. Starting shell-use session..."
    shell-use open --cwd "$TEST_DIR" --session pi-e2e-test
    sleep 2
    
    # Start Pi with the extension
    echo "4. Starting Pi..."
    shell-use submit "pi -ne --approve -ns -e ../index.ts" --session pi-e2e-test
    shell-use wait idle --session pi-e2e-test --timeout 15000
    
    # Reload extension config
    echo "   Reloading extension config..."
    send_test "/reload" 10000 0
fi

# Run tests
echo "5. Running tests..."

# Test 1: rm ./target.txt (should be ALLOWED)
echo "   Test 1: rm ./target.txt"
send_test "remove the file ./target.txt in the current directory" 60000 1

# Test 2: rm ./data/files/test.txt (should be ALLOWED)
echo "   Test 2: rm ./data/files/test.txt"
send_test "remove the file ./data/files/test.txt" 60000 2

# Test 3: rm /tmp/test-e2e/tmp-file.txt (should be ALLOWED)
echo "   Test 3: rm /tmp/test-e2e/tmp-file.txt"
send_test "remove the file /tmp/test-e2e/tmp-file.txt" 60000 3

# Test 4: rm ../parent-file.txt (should be DENIED)
echo "   Test 4: rm ../parent-file.txt"
send_test "remove the file ../parent-file.txt" 60000 4

# Test 5: rm data/files/test.txt (should be DENIED)
echo "   Test 5: rm data/files/test.txt"
send_test "remove the file data/files/test.txt" 60000 5

# Test 6: rm -rf ./test-folder (should be ALLOWED)
echo "   Test 6: rm -rf ./test-folder"
send_test "remove the folder ./test-folder" 60000 6

# Test 7: rm -rf /tmp/test-e2e-folder (should be ALLOWED)
echo "   Test 7: rm -rf /tmp/test-e2e-folder"
send_test "remove the folder /tmp/test-e2e-folder" 60000 7

# Get session output
echo ""
echo "6. Session output:"
if [ "$USE_HERDR" = true ]; then
    herdr pane read "$TEST_PANE" --source recent-unwrapped --lines 100 2>/dev/null
else
    shell-use text --session pi-e2e-test
fi

# Save recording
echo ""
echo "7. Saving recording..."
if [ "$USE_HERDR" = true ]; then
    herdr pane get-recording "$TEST_PANE" > "$SCRIPT_DIR/pi-e2e-test.cast" 2>/dev/null || true
else
    shell-use get-recording pi-e2e-test > "$SCRIPT_DIR/pi-e2e-test.cast" 2>/dev/null || true
fi

# Check results
echo ""
echo "8. Checking results..."
echo ""

# Check if files/folders were deleted/kept as expected
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

# Run tests - check file state AFTER LLM executed commands
if test_result "$TEST_DIR/target.txt" "delete" "rm ./target.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$TEST_DIR/data/files/test.txt" "delete" "rm ./data/files/test.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "/tmp/test-e2e/tmp-file.txt" "delete" "rm /tmp/test-e2e/tmp-file.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$SCRIPT_DIR/../parent-file.txt" "keep" "rm ../parent-file.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
total=$((total + 1))

if test_result "$TEST_DIR/data/files/test.txt" "keep" "rm data/files/test.txt" false; then passed=$((passed + 1)); else failed=$((failed + 1)); fi
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
if [ "$USE_HERDR" = true ]; then
    herdr pane close "$TEST_PANE" 2>/dev/null || true
else
    shell-use close --session pi-e2e-test 2>/dev/null || true
fi
rm -rf "$TEST_DIR" /tmp/test-e2e /tmp/test-e2e-folder "$SCRIPT_DIR/../parent-file.txt"

echo ""
echo "Recording saved to: pi-e2e-test.cast"
echo ""

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
