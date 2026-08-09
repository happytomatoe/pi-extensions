#!/bin/bash
# E2E Test for forbid-commands extension - rm rules
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== E2E Test for forbid-commands extension - rm rules ==="
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

# Function to test a case
test_case() {
    local description="$1"
    local command="$2"
    local expected_result="$3"  # "allow" or "deny"
    local file_path="$4"
    
    echo -e "${YELLOW}Test: ${description}${NC}"
    echo "   Command: $command"
    
    # Check if file exists before
    if [ -f "$file_path" ] || [ -d "$file_path" ]; then
        echo "   File exists before: YES"
    else
        echo "   File exists before: NO (WARNING: file not found)"
    fi
    
    # Run the command
    cd "$SCRIPT_DIR"
    result=$(npx tsx src/cli.ts "$command" 2>&1)
    exit_code=$?
    
    echo "   Extension result: $result (exit code: $exit_code)"
    
    # Check if result matches expected
    if [ "$result" = "$expected_result" ]; then
        echo -e "   ${GREEN}PASS: Got expected result '$expected_result'${NC}"
        return 0
    else
        echo -e "   ${RED}FAIL: Expected '$expected_result' but got '$result'${NC}"
        return 1
    fi
}

# Track results
total=0
passed=0
failed=0

# Test 1: rm ./target.txt (should be ALLOWED)
echo "-------------------------------------------"
if test_case "rm ./target.txt (current dir)" "rm ./target.txt" "allow" "$TEST_DIR/target.txt"; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 2: rm ./data/files/test.txt (should be ALLOWED)
echo "-------------------------------------------"
if test_case "rm ./data/files/test.txt (subdir)" "rm ./data/files/test.txt" "allow" "$TEST_DIR/data/files/test.txt"; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 3: rm /tmp/test-e2e/tmp-file.txt (should be ALLOWED)
echo "-------------------------------------------"
if test_case "rm /tmp/test-e2e/tmp-file.txt (/tmp)" "rm /tmp/test-e2e/tmp-file.txt" "allow" "/tmp/test-e2e/tmp-file.txt"; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 4: rm ../parent-file.txt (should be DENIED)
echo "-------------------------------------------"
if test_case "rm ../parent-file.txt (parent)" "rm ../parent-file.txt" "deny" "$SCRIPT_DIR/../parent-file.txt"; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 5: rm data/files/test.txt without ./ (should be DENIED)
echo "-------------------------------------------"
# Recreate file for this test
mkdir -p "$TEST_DIR/data/files"
echo "test" > "$TEST_DIR/data/files/test.txt"
if test_case "rm data/files/test.txt (no ./)" "rm data/files/test.txt" "deny" "$TEST_DIR/data/files/test.txt"; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Summary
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

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
