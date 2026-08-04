# forbid-commands Extension

## Overview

The `forbid-commands` extension protects your system by intercepting commands before they execute. It uses a three-tier approach:

1. **Deny List** - Explicit patterns that are always blocked
2. **Allow List** - Explicit patterns that bypass DCG
3. **DCG (Dangerous Command Guard)** - AI-powered analysis of command safety

## Decision Flow

```
Command received
    ↓
Match deny pattern? → DENY (exit 2)
    ↓
Match allow pattern? → ALLOW (exit 0)
    ↓
DCG blocks? → DENY (exit 2)
    ↓
ALLOW (exit 0)
```

**Note:** The `ask` status exists for future use (interactive confirmation), but currently all commands are either allowed or denied.

## Exit Codes

| Code | Status | Meaning |
|------|--------|---------|
| 0 | `allow` | Command is allowed to run |
| 1 | `ask` | User confirmation required (reserved) |
| 2 | `deny` | Command is blocked |

## CLI Usage

### Via Justfile (Recommended)

```bash
# Check a command
just check "echo hello"
just check "sudo ls /tmp"
just check "kill 1234"

# Check from stdin
echo "rm -rf /tmp/test" | just check-stdin

# Run all tests
just test
```

### Direct CLI

```bash
# Single command
npx tsx src/cli.ts "echo hello"

# From stdin
echo "echo hello" | npx tsx src/cli.ts
```

## Configuration

Config file: `~/.pi/agent/forbid-commands.yaml`

### Deny Patterns

Commands that are always blocked:

```yaml
deny:
  - pattern: "shutdown *"
    message: "Shutdown is forbidden"
  - pattern: "kill *"
    message: "Killing processes by PID is forbidden"
  - pattern: "pkill brave"
    message: "Killing Brave processes is forbidden"
  - pattern: "sudo *"
    message: "Sudo requires approval"
```

### Allow Patterns

Commands that bypass DCG analysis:

```yaml
allow:
  # Read-only commands
  - pattern: "echo *"
  - pattern: "ls *"
  - pattern: "cat *"
  
  # Safe operations
  - pattern: "git status"
  - pattern: "git log *"
```

### DCG Settings

```yaml
# Enable/disable DCG
use_dcg: true

# DCG sensitivity
dcg:
  sensitivity: medium
  blocked_commands:
    - dd
    - mkfs
    - format
```

## Testing

### Run All Tests

```bash
just test
```

This runs all Vitest tests and reports pass/fail for each.

### Run Specific Test Suites

```bash
# Run only evaluator tests (command checking)
just test-evaluator

# Run only normalization tests (path/quote handling)
just test-normalize

# Run tests in watch mode (re-runs on file changes)
just test-watch

# Run E2E tests with Pi
just test-e2e
```

### Test Structure

```
tests/
├── evaluator.test.ts       # Unit tests for command checking
├── normalization.test.ts   # Unit tests for path/quote normalization
├── e2e-pi-test.ts          # E2E tests with Pi (sequential)
└── Dockerfile              # Docker test environment
```

### Table-Driven Tests

Tests use a table-driven approach for easy maintenance:

```typescript
const testCases: Array<[string, "allow" | "ask" | "deny"]> = [
  ["echo hello", "allow"],
  ["sudo ls", "deny"],
  // Add more test cases here
];

testCases.forEach(([command, expected]) => {
  it(`"${command}" → ${expected}`, () => {
    expect(checkCommand(command).state).toBe(expected);
  });
});
```

### Adding New Test Cases

To add new test cases, edit the test files:

1. **For command checking**: Add to `tests/evaluator.test.ts`
2. **For normalization**: Add to `tests/normalization.test.ts`

### Test Specific Command

```bash
# Expected: allow
just check "echo hello"

# Expected: deny
just check "sudo ls /tmp"

# Expected: ask
just check "rm /tmp/test.txt"
```

## Architecture

```
src/
├── config.ts          # Config loading (YAML)
├── evaluator.ts       # Main evaluation logic
├── cli.ts             # CLI entry point
├── normalize.ts       # Command normalization
├── wildcard-utils.ts  # Wildcard matching
├── dcg.ts             # DCG integration
└── utils.ts           # Utilities
```

## Bypass Testing

The extension normalizes commands to catch bypass techniques:

### Path Variations
```bash
/bin/rm -rf /      → rm -rf / (blocked)
/usr/bin/rm -rf /  → rm -rf / (blocked)
```

### Quote Variations
```bash
"rm" -rf /   → rm -rf / (blocked)
'rm' -rf /   → rm -rf / (blocked)
```

### Backslash Variations
```bash
\rm -rf /    → rm -rf / (blocked)
\sudo ls     → sudo ls (blocked)
```

### Combined Techniques
```bash
"/bin/rm" -rf /  → rm -rf / (blocked)
```

## Debugging

### Enable Debug Output

```bash
DEBUG=forbid-commands npx tsx src/cli.ts "your command"
```

### Check Config Location

The extension looks for config in:
1. `~/.pi/agent/forbid-commands.yaml` (global)
2. `.pi/forbid-commands.yaml` (project)

### Common Issues

**Problem:** Command not matching expected pattern
```bash
# Debug: see what patterns are being tested
DEBUG=forbid-commands npx tsx src/cli.ts "your command"
```

**Problem:** DCG blocking allowed command
```bash
# Solution: Add to allow list
allow:
  - pattern: "your command *"
```
