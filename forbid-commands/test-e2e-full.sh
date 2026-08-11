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

# Setup test directory structure with unique temp dirs
SETUP_MARKER=""
setup_cleanup() {
    if [ -n "$SETUP_MARKER" ]; then
        rm -rf "$SETUP_MARKER"
    fi
}
trap setup_cleanup EXIT

SETUP_MARKER=$(mktemp -d)
TEST_DIR="$SETUP_MARKER/test-e2e"
mkdir -p "$TEST_DIR/data/files"
echo "test" > "$TEST_DIR/target.txt"
echo "test" > "$TEST_DIR/data/files/test.txt"
TMP_TEST=$(mktemp -d)
echo "test" > "$TMP_TEST/tmp-file.txt"
echo "test" > "$SETUP_MARKER/parent-file.txt"

# Export paths for test functions
export TEST_DIR TMP_TEST SETUP_MARKER

echo "   Created:"
echo "   - $TEST_DIR/target.txt"
echo "   - $TEST_DIR/data/files/test.txt"
echo "   - $TMP_TEST/tmp-file.txt"
echo "   - $SETUP_MARKER/parent-file.txt"
echo ""

# Function to test a case
test_case() {
    local description="$1"
    local command="$2"
    local expected_result="$3"  # "allow" or "deny"
    local file_path="$4"
    local should_delete="${5:-false}"  # Whether to actually execute the command
    
    echo -e "${YELLOW}Test: ${description}${NC}"
    echo "   Command: $command"
    
    # Check if file exists before
    local exists_before=false
    if [ -f "$file_path" ] || [ -d "$file_path" ]; then
        echo "   File exists before: YES"
        exists_before=true
    else
        echo "   File exists before: NO (WARNING: file not found)"
    fi
    
    # Run the command through the CLI
    cd "$SCRIPT_DIR"
    result=$(npx tsx src/cli.ts "$command" 2>&1)
    exit_code=$?
    
    echo "   Extension result: $result (exit code: $exit_code)"
    
    # Check if result matches expected
    if [ "$result" != "$expected_result" ]; then
        echo -e "   ${RED}FAIL: Expected '$expected_result' but got '$result'${NC}"
        return 1
    fi
    
    # If command should be executed and result is allow, run it
    if [ "$should_delete" = "true" ] && [ "$result" = "allow" ]; then
        echo "   Executing command..."
        eval "$command" 2>/dev/null || true
        
        # Verify filesystem state
        if [ -f "$file_path" ] || [ -d "$file_path" ]; then
            echo -e "   ${RED}FAIL: File still exists after allowed command${NC}"
            return 1
        else
            echo "   File deleted successfully"
        fi
    fi
    
    echo -e "   ${GREEN}PASS: Got expected result '$expected_result'${NC}"
    return 0
}

# Track results
total=0
passed=0
failed=0

# Test 1: rm ./target.txt (should be ALLOWED and executed)
echo "-------------------------------------------"
# Recreate file for execution test
echo "test" > "$TEST_DIR/target.txt"
if test_case "rm ./target.txt (current dir)" "rm $TEST_DIR/target.txt" "allow" "$TEST_DIR/target.txt" true; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 2: rm /tmp test file (should be ALLOWED and executed)
echo "-------------------------------------------"
if test_case "rm /tmp test file" "rm $TMP_TEST/tmp-file.txt" "allow" "$TMP_TEST/tmp-file.txt" true; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 3: rm ../parent-file.txt (should be DENIED)
echo "-------------------------------------------"
if test_case "rm ../parent-file.txt (parent)" "rm $SETUP_MARKER/parent-file.txt" "deny" "$SETUP_MARKER/parent-file.txt" false; then
    passed=$((passed + 1))
else
    failed=$((failed + 1))
fi
total=$((total + 1))
echo ""

# Test 4: rm relative-file.txt without ./ (should be DENIED)
echo "-------------------------------------------"
mkdir -p "$TEST_DIR/data/files"
echo "test" > "$TEST_DIR/data/files/test.txt"
if test_case "rm relative path (no ./)" "rm data/files/test.txt" "deny" "$TEST_DIR/data/files/test.txt" false; then
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
rm -rf "$SETUP_MARKER" 2>/dev/null || true

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
