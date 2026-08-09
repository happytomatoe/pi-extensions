#!/bin/bash
# E2E Test with Pi and forbid-commands extension
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
mkdir -p "$TEST_DIR/data/files"
echo "test" > "$TEST_DIR/target.txt"
echo "test" > "$TEST_DIR/data/files/test.txt"
mkdir -p /tmp/test-e2e /tmp/test-e2e-dir
echo "test" > /tmp/test-e2e/tmp-file.txt
echo "test" > /tmp/test-e2e-dir/nested.txt
echo "test" > "$SCRIPT_DIR/../parent-file.txt"
echo "   Created:"
echo "   - $TEST_DIR/target.txt"
echo "   - $TEST_DIR/data/files/test.txt"
echo "   - /tmp/test-e2e/tmp-file.txt"
echo "   - /tmp/test-e2e-dir/nested.txt"
echo "   - $SCRIPT_DIR/../parent-file.txt"
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
echo ""

# Run tests with shell-use
echo "3. Running tests with Pi..."
echo ""

# Open shell session
shell-use open --cwd "$TEST_DIR" --session pi-e2e-test

# Wait for shell to be ready
sleep 2

# Start pi with the extension
shell-use submit "cd /var/home/l/git/pi-extensions/forbid-commands && pi" --session pi-e2e-test
sleep 5

# Test 1: rm ./target.txt (should be ALLOWED)
echo "   Test 1: rm ./target.txt"
shell-use submit "remove the file ./target.txt in the current directory" --session pi-e2e-test
sleep 15

# Test 2: rm ../parent-file.txt (should be DENIED)
echo "   Test 2: rm ../parent-file.txt"
shell-use submit "remove the file ../parent-file.txt" --session pi-e2e-test
sleep 15

# Test 3: rm /tmp/test-e2e/tmp-file.txt (should be ALLOWED)
echo "   Test 3: rm /tmp/test-e2e/tmp-file.txt"
shell-use submit "remove the file /tmp/test-e2e/tmp-file.txt" --session pi-e2e-test
sleep 15

# Get output
echo ""
echo "4. Session output:"
shell-use text --session pi-e2e-test

# Save recording
shell-use get-recording pi-e2e-test > "$SCRIPT_DIR/pi-e2e-test.cast"

# Close session
shell-use close --session pi-e2e-test

# Check results
echo ""
echo "5. Checking results..."
echo ""

# Check if files were deleted/kept as expected
test_result() {
    local file="$1"
    local expected="$2"
    local test_name="$3"
    
    if [ -f "$file" ] || [ -d "$file" ]; then
        if [ "$expected" = "keep" ]; then
            echo -e "   ${GREEN}PASS${NC}: $test_name - File still exists (correctly blocked)"
            return 0
        else
            echo -e "   ${RED}FAIL${NC}: $test_name - File still exists (should have been deleted)"
            return 1
        fi
    else
        if [ "$expected" = "delete" ]; then
            echo -e "   ${GREEN}PASS${NC}: $test_name - File deleted (correctly allowed)"
            return 0
        else
            echo -e "   ${RED}FAIL${NC}: $test_name - File deleted (should have been blocked)"
            return 1
        fi
    fi
}

total=0
passed=0
failed=0

# Recreate files for testing (since pi might have deleted them)
mkdir -p "$TEST_DIR/data/files"
echo "test" > "$TEST_DIR/target.txt"
echo "test" > "$TEST_DIR/data/files/test.txt"
echo "test" > "$SCRIPT_DIR/../parent-file.txt"

# Run tests
if test_result "$TEST_DIR/target.txt" "delete" "rm ./target.txt"; then ((passed++)); else ((failed++)); fi
((total++))

if test_result "$TEST_DIR/data/files/test.txt" "delete" "rm ./data/files/test.txt"; then ((passed++)); else ((failed++)); fi
((total++))

if test_result "/tmp/test-e2e/tmp-file.txt" "delete" "rm /tmp/test-e2e/tmp-file.txt"; then ((passed++)); else ((failed++)); fi
((total++))

if test_result "$SCRIPT_DIR/../parent-file.txt" "keep" "rm ../parent-file.txt"; then ((passed++)); else ((failed++)); fi
((total++))

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
rm -rf "$TEST_DIR" /tmp/test-e2e /tmp/test-e2e-dir "$SCRIPT_DIR/../parent-file.txt"

echo ""
echo "Recording saved to: pi-e2e-test.cast"
echo "To play: asciinema play pi-e2e-test.cast"
echo ""

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
