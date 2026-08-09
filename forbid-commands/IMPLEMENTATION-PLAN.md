# Implementation Plan: Harden forbid-commands Extension

## Overview

This plan hardens the `forbid-commands` extension by fixing bypass vulnerabilities while maintaining the **denylist approach** (allow everything by default, block specific dangerous patterns). This is fundamentally different from pi-gatekeeper's allowlist approach (block everything by default, allow only known-safe patterns).

**Philosophy:** We keep the convenience of "normal work uninterrupted" while closing security gaps.

**Scope:** Focus on path normalization, quote normalization, and external tool interception. Skip obfuscation detection for now.

## Current State Analysis

### What Exists Now

The extension intercepts `tool_call` events for the `bash` tool and uses tree-sitter-bash AST parsing to:

1. Enumerate commands from complex bash syntax
2. Match patterns against commands
3. Allow/Ask/Deny based on rules

### Key Discoveries

1. **Env Var Handling is CORRECT** (tested and verified):
   - `stripVariableAssignments()` removes env vars before matching
   - Pattern `rm *` matches `rm -rf /` (after stripping)
   - No bypass needed - current behavior is correct

2. **GuardFall Vulnerability** (Adversa AI, June 2026):
   - 10/11 open-source AI coding agents have bypassable command guards
   - Core issue: guards inspect raw text, but bash rewrites text before execution
   - Denylist-based security is **fundamentally fragile** but can be hardened

3. **External Tool Bypass**:
   - `shell-use` sends commands via PTY daemon, not `bash` tool directly
   - `herdr` sends commands to other panes, not `bash` tool directly
   - `tmux` sends commands via `tmux send-keys`, not `bash` tool directly

### What's Missing

- ❌ Path normalization (`/bin/rm` → `rm`)
- ❌ Quote normalization (`"rm"` → `rm`)
- ❌ shell-use/herdr/tmux interception

## Desired End State

After this implementation, the extension should:

1. **Block path variations** (`/bin/rm -rf /`)
2. **Block quote variations** (`"rm" -rf /`)
3. **Block external tool bypass** (`shell-use submit "rm -rf /"`)
4. **Maintain the denylist approach** (convenience-first)

### Verification Criteria

- [ ] `/bin/rm -rf /` is blocked when `rm` is in deny list
- [ ] `"rm" -rf /` is blocked when `rm` is in deny list
- [ ] `shell-use submit "rm -rf /"` is blocked when `rm` is in deny list
- [ ] `herdr agent send agent1 "rm -rf /"` is blocked when `rm` is in deny list
- [ ] `tmux send-keys "rm -rf /" Enter` is blocked when `rm` is in deny list
- [ ] All existing tests still pass
- [ ] Performance impact < 10ms per command

## What We're NOT Doing

- ❌ **Env var bypass fix** - current behavior is correct (tested and verified)
- ❌ **Obfuscation detection** (base64, $IFS, etc.) - can add later
- ❌ **Backward compatibility** - we can break existing patterns
- ❌ **Complex configuration** - keep it simple
- ❌ **Migrating to allowlist approach** - we keep denylist

## Implementation Approach

We'll implement in phases, ordered by security impact:

1. **Phase 1:** Normalize paths and quotes (MEDIUM priority)
2. **Phase 2:** Intercept shell-use/herdr/tmux (MEDIUM priority)
3. **Phase 3:** End-to-end testing with shell-use (HIGH priority)

---

## Phase 1: Normalize Paths and Quotes

### Overview

Normalize command text to catch variations like `/bin/rm`, `"rm"`, `\rm` that bypass simple pattern matching.

### Changes Required

#### 1. Create normalizer

**File**: `src/normalize.ts` (new file)

```typescript
/**
 * Normalize command text to catch bypass variations
 */
export function normalizeCommand(text: string): string {
  let normalized = text;
  
  // 1. Strip quotes: "rm" → rm, 'rm' → rm
  // Only strip quotes around whole words, not arguments
  normalized = normalized.replace(/(["'])\w+\1/g, (match) => {
    return match.slice(1, -1);
  });
  
  // 2. Normalize paths: /bin/rm → rm, /usr/bin/rm → rm
  // Only normalize known binary paths
  const knownBinaries = ['rm', 'cat', 'ls', 'grep', 'find', 'kill', 'pkill', 'sudo', 'env'];
  for (const binary of knownBinaries) {
    const pathRegex = new RegExp(`(?:/[\\w.-]+)+/${binary}\\b`, 'g');
    normalized = normalized.replace(pathRegex, binary);
  }
  
  // 3. Remove backslashes: \rm → rm
  normalized = normalized.replace(/\\(\w)/g, '$1');
  
  // 4. Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Get both original and normalized versions for matching
 */
export function getMatchingTexts(text: string): string[] {
  const normalized = normalizeCommand(text);
  const texts = [text];
  
  if (normalized !== text) {
    texts.push(normalized);
  }
  
  return texts;
}
```

#### 2. Integrate into evaluator

**File**: `src/evaluator.ts`

```typescript
import { getMatchingTexts } from "./normalize";

export function evaluateCommand(
  command: BashCommand,
  rules: PatternRule[],
  cwd?: string
): EvaluationResult {
  // Get all text versions to try (stripped, normalized)
  const textsToTry = [
    command.text,
    ...getMatchingTexts(command.text),
  ].filter(Boolean);
  
  // Try matching against all versions
  let matched: PatternRule | undefined;
  for (const text of textsToTry) {
    matched = matchRulesLastWins(rules, text!, cwd);
    if (matched) break;
  }
  
  // ... rest of evaluation
}
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm test`

#### Manual Verification:
- [ ] `/bin/rm -rf /` is blocked when `rm` is in deny list
- [ ] `/usr/bin/rm -rf /` is blocked when `rm` is in deny list
- [ ] `"rm" -rf /` is blocked when `rm` is in deny list
- [ ] `'rm' -rf /` is blocked when `rm` is in deny list
- [ ] `\rm -rf /` is blocked when `rm` is in deny list
- [ ] Existing patterns still work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Intercept shell-use/herdr/tmux

### Overview

Detect when commands are sent via external tools (shell-use, herdr, tmux) and extract the actual command for pattern matching.

### Changes Required

#### 1. Update tool interception list

**File**: `index.ts`

```typescript
// Known tools that can execute commands
const COMMAND_TOOLS = new Set([
  "bash",
  "shell_use",
  "shell-use",
  "herdr",
  "tmux_run",
  "tmux-run",
  "user_bash",
]);
```

#### 2. Add command extraction functions

**File**: `src/command-extractor.ts` (new file)

```typescript
/**
 * Extract command from different tool schemas
 */
export function extractCommandFromTool(
  toolName: string,
  input: Record<string, unknown>
): string | null {
  switch (toolName) {
    case "bash":
    case "user_bash":
      return typeof input.command === "string" ? input.command : null;
    
    case "shell_use":
    case "shell-use":
      // shell-use submit/run commands
      return typeof input.command === "string" ? input.command : 
             typeof input.code === "string" ? input.code : null;
    
    case "herdr":
      // herdr agent send commands
      if (typeof input.command === "string") {
        return input.command;
      }
      // herdr pane run commands
      if (typeof input.text === "string") {
        return input.text;
      }
      return null;
    
    case "tmux_run":
    case "tmux-run":
      // tmux send-keys commands
      return typeof input.command === "string" ? input.command :
             typeof input.keys === "string" ? input.keys : null;
    
    default:
      return null;
  }
}

/**
 * Check if a tool name is a command execution tool
 */
export function isCommandTool(toolName: string): boolean {
  return COMMAND_TOOLS.has(toolName);
}
```

#### 3. Update main handler

**File**: `index.ts`

```typescript
import { extractCommandFromTool, isCommandTool } from "./src/command-extractor";

pi.on("tool_call", async (event, ctx) => {
  if (!isCommandTool(event.toolName)) return;
  
  const command = extractCommandFromTool(event.toolName, event.input);
  if (!command) return;
  
  // ... rest of evaluation logic
});
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Unit tests pass: `npm test`

#### Manual Verification:
- [ ] `shell-use submit "rm -rf /"` is blocked when `rm` is in deny list
- [ ] `herdr agent send agent1 "rm -rf /"` is blocked when `rm` is in deny list
- [ ] `tmux send-keys "rm -rf /" Enter` is blocked when `rm` is in deny list
- [ ] Normal bash commands still work

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: End-to-End Testing with shell-use

### Overview

Create a comprehensive end-to-end testing script that uses shell-use to test all bypass techniques.

### Changes Required

#### 1. Create test script

**File**: `tests/e2e-bypass-test.sh` (new file)

```bash
#!/bin/bash
# End-to-end testing script for forbid-commands bypass techniques
# Uses shell-use to test command interception

set -e

echo "=== forbid-commands Bypass Testing ==="
echo ""

# Test 1: Path variations
echo "Test 1: Path variations"
echo "  Testing: /bin/rm -rf /tmp/test"
echo "  Expected: Should be blocked"
echo ""

# Test 2: Quote variations
echo "Test 2: Quote variations"
echo '  Testing: "rm" -rf /tmp/test'
echo "  Expected: Should be blocked"
echo ""

# Test 3: shell-use bypass
echo "Test 3: shell-use bypass"
echo '  Testing: shell-use submit "rm -rf /tmp/test"'
echo "  Expected: Should be blocked"
echo ""

# Test 4: herdr bypass
echo "Test 4: herdr bypass"
echo '  Testing: herdr agent send agent1 "rm -rf /tmp/test"'
echo "  Expected: Should be blocked"
echo ""

# Test 5: tmux bypass
echo "Test 5: tmux bypass"
echo '  Testing: tmux send-keys "rm -rf /tmp/test" Enter'
echo "  Expected: Should be blocked"
echo ""

echo "=== Testing Complete ==="
```

#### 2. Create unit tests

**File**: `tests/evaluator.test.ts` (new file)

```typescript
import { describe, it, expect } from "vitest";
import { evaluateCommand } from "./evaluator";
import { BashCommand } from "./command-enumerator";

describe("Bypass Technique Tests", () => {
  const denyRules = [
    { pattern: "rm -rf *", state: "deny" as const },
    { pattern: "rm *", state: "deny" as const },
  ];
  
  describe("Path Variations", () => {
    it("should block /bin/rm -rf /", () => {
      const cmd: BashCommand = {
        text: "/bin/rm -rf /",
        kind: "simple",
      };
      const result = evaluateCommand(cmd, denyRules);
      expect(result.state).toBe("deny");
    });
  });
  
  describe("Quote Removal", () => {
    it('should block "rm" -rf /', () => {
      const cmd: BashCommand = {
        text: '"rm" -rf /',
        kind: "simple",
      };
      const result = evaluateCommand(cmd, denyRules);
      expect(result.state).toBe("deny");
    });
  });
  
  // ... more tests
});
```

### Success Criteria

#### Automated Verification:
- [ ] All unit tests pass: `npm test`
- [ ] Coverage > 80%: `npm run coverage`
- [ ] E2E script runs without errors

#### Manual Verification:
- [ ] E2E script correctly identifies blocked commands
- [ ] All bypass techniques are tested
- [ ] Test results are clear and actionable

---

## Performance Considerations

- **Caching**: Cache normalized commands to avoid repeated processing
- **Early exit**: Skip normalization if command is already matched
- **Lazy loading**: Only load normalizer if needed

## Migration Notes

- **Breaking changes**: Existing patterns may need to be updated
- **No backward compatibility**: We can change matching logic freely
- **Simple migration**: Users may need to adjust patterns if they relied on old behavior

## References

- GuardFall vulnerability: Adversa AI research (June 2026)
- pi-gatekeeper: https://github.com/noel-debug/pi-gatekeeper
- shell-use: https://github.com/user/shell-use
- herdr: https://herdr.dev
