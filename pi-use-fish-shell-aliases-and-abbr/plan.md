# Fish Shell Abbreviations & Aliases Extension — Implementation Plan

## Overview

A single-file pi extension that reads fish shell abbreviations (which include aliases in modern fish 3.6+) at session start and expands them in user input with word-boundary matching before sending to the LLM.

## Current State Analysis

- Fish provides `abbr --show` which outputs abbreviations in a consistent format: `abbr -a -- KEY VALUE` or `abbr -a -- KEY 'VALUE'`
- Pi's `input` event allows intercepting and transforming user text before agent processing
- The `input-transform.ts` example provides the exact pattern we need
- User has 185 abbreviations from fish shell
- No extra npm dependencies required

## Desired End State

- Extension reads abbreviations once at session start
- User types `gc fix the bug` → editor shows `git commit -v fix the bug` → sent to LLM
- `agc something` stays as `agc something` (word-boundary matching)
- `/abbr` command prints the full abbreviation list
- Graceful fallback when fish is not installed

### Key Discoveries:
- `abbr --show` output is consistently parseable (format: `abbr -a -- KEY VALUE`)
- Modern fish treats aliases as abbreviations, so `abbr --show` covers both
- Pi's `input` event supports `{ action: "transform", text: "..." }` to rewrite input
- Pi's `input` event supports returning updated images alongside text

## What We're NOT Doing

- Not injecting abbreviation list into system prompt (LLM stays unaware of abbreviations)
- Not expanding abbreviations in LLM-generated bash commands
- Not re-reading abbreviations mid-session
- Not supporting fish functions as abbreviations
- Not providing configuration file — reads directly from fish
- Not building a TUI component or custom UI

## Implementation Approach

Single TypeScript file with no external dependencies. Uses `pi.exec("bash", ...)` to run fish and parse its output. Hooks the `input` event for expansion. Registers a `/abbr` command for listing.

## Phase 1: Core Extension

### Overview
Create the extension file that reads abbreviations from fish and expands user input.

### Changes Required:

#### 1. Extension entry point
**File**: `pi-use-fish-shell-aliases-and-abbr.ts`
**Changes**: Create the full extension

```typescript
/**
 * Fish Shell Abbreviations & Aliases Extension
 *
 * Reads fish abbreviations at session start and expands them in user input.
 *
 * Usage:
 *   pi -e ./pi-use-fish-shell-aliases-and-abbr.ts
 *
 * Or place in ~/.pi/agent/extensions/ for auto-discovery.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Regex to parse `abbr -a -- key value` or `abbr -a -- key 'value'`
const ABBR_LINE_RE = /^abbr -a -- (\S+)\s+(.+)$/;

// Match word boundaries: start of string or space before the abbreviation,
// and end of string or space/punctuation after it
function makeAbbrPattern(abbr: string): RegExp {
  // Escape special regex characters in the abbreviation
  const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)(${escaped})(?=\\s|$|[;|&])`, "g");
}

export default function (pi: ExtensionAPI) {
  let abbreviations: Record<string, string> = {};

  // Parse abbreviations from fish output
  function parseAbbrOutput(output: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const match = ABBR_LINE_RE.exec(line.trim());
      if (match) {
        const [, key, value] = match;
        // Remove surrounding quotes if present
        result[key] = value.replace(/^['"]|['"]$/g, "");
      }
    }
    return result;
  }

  // Read abbreviations from fish
  async function loadAbbreviations(): Promise<Record<string, string>> {
    try {
      const result = await pi.exec("bash", [
        "-c",
        "fish -c 'abbr --show'",
      ]);
      if (result.code === 0 && result.stdout) {
        return parseAbbrOutput(result.stdout);
      }
    } catch {
      // fish not available or abbr command failed
    }
    return {};
  }

  // Expand abbreviations in text (word-boundary matching)
  function expandText(text: string): string {
    if (Object.keys(abbreviations).length === 0) return text;

    let result = text;
    // Sort by length descending so longer abbreviations match first
    // (e.g., "gaa" before "ga" before "g")
    const sorted = Object.keys(abbreviations).sort(
      (a, b) => b.length - a.length,
    );

    for (const abbr of sorted) {
      const pattern = makeAbbrPattern(abbr);
      result = result.replace(pattern, (match, captured, offset) => {
        const prefix = match.slice(0, match.indexOf(captured));
        return `${prefix}${abbreviations[abbr]}`;
      });
    }

    return result;
  }

  // Load abbreviations at session start
  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "reload") {
      abbreviations = await loadAbbreviations();
      const count = Object.keys(abbreviations).length;
      if (count > 0) {
        ctx.ui.notify(`Loaded ${count} fish abbreviations`, "info");
      }
    }
  });

  // Expand user input
  pi.on("input", async (event, ctx) => {
    // Skip extension-injected messages
    if (event.source === "extension") {
      return { action: "continue" };
    }

    // Skip if no abbreviations loaded
    if (Object.keys(abbreviations).length === 0) {
      return { action: "continue" };
    }

    // Skip whole-line bash commands (! prefix)
    if (event.text.trimStart().startsWith("!")) {
      return { action: "continue" };
    }

    const expanded = expandText(event.text);

    if (expanded !== event.text) {
      // Show what was expanded
      ctx.ui.notify(
        `Expanded: ${event.text.slice(0, 40)}${event.text.length > 40 ? "..." : ""} → ${expanded.slice(0, 40)}${expanded.length > 40 ? "..." : ""}`,
        "info",
      );
      return { action: "transform", text: expanded, images: event.images };
    }

    return { action: "continue" };
  });

  // /abbr command to list abbreviations
  pi.registerCommand("abbr", {
    description: "List fish shell abbreviations",
    handler: async (args, ctx) => {
      const entries = Object.entries(abbreviations);

      if (entries.length === 0) {
        ctx.ui.notify("No abbreviations loaded", "warning");
        return;
      }

      // Filter by prefix if argument provided
      const filter = args.trim().toLowerCase();
      const filtered = filter
        ? entries.filter(
            ([key, value]) =>
              key.toLowerCase().includes(filter) ||
              value.toLowerCase().includes(filter),
          )
        : entries;

      if (filtered.length === 0) {
        ctx.ui.notify(
          `No abbreviations matching "${filter}" (${entries.length} total)`,
          "warning",
        );
        return;
      }

      // Print to output
      const lines = filtered.map(([key, value]) => `  ${key} → ${value}`);
      const header = `Fish abbreviations${filter ? ` matching "${filter}"` : ""} (${filtered.length}/${entries.length}):\n`;
      console.log(header + lines.join("\n"));
    },
  });
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Extension loads without errors: `pi -e ./pi-use-fish-shell-aliases-and-abbr.ts`
- [ ] Shell-use Test 1: Extension loads and abbreviations are read
- [ ] Shell-use Test 2: Abbreviation expansion works
- [ ] Shell-use Test 3: Non-abbreviation text passes through
- [ ] Shell-use Test 4: Word-boundary matching (no false positives)
- [ ] Shell-use Test 5: /abbr command lists abbreviations
- [ ] Shell-use Test 6: /abbr with filter
- [ ] Shell-use Test 7: Bash commands are not expanded

---

## Phase 2: Edge Cases & Polish

### Overview
Handle edge cases and improve robustness.

### Changes Required:

#### 1. Handle abbreviations with special characters
**File**: `pi-use-fish-shell-aliases-and-abbr.ts`
**Changes**: Ensure abbreviations containing regex special chars are properly escaped in patterns.

Already handled in `makeAbbrPattern` with `abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")`.

#### 2. Handle abbreviations with spaces in key
**File**: `pi-use-fish-shell-aliases-and-abbr.ts`
**Changes**: Current regex `\S+` for the key handles most cases. Multi-word abbreviations (rare) would need adjustment but are uncommon in practice.

### Success Criteria:

#### Automated Verification:
- [ ] Shell-use tests pass for abbreviations with special characters
- [ ] Shell-use tests pass for abbreviations with quotes in value
- [ ] Shell-use tests pass for abbreviations with single-word values

---

## Testing Strategy

### Automated Testing (shell-use)

All tests run via `shell-use` to drive a real terminal session. Each test is a standalone script that can be executed and verified automatically.

#### Test Setup

```bash
# Ensure fish is available
which fish

# Add a test abbreviation
cat > /tmp/fish_test_setup.fish << 'EOF'
abbr --add testabb 'hello world'
abbr --add g git
abbr --add ga 'git add'
EOF
fish /tmp/fish_test_setup.fish
```

#### Test 1: Extension loads and abbreviations are read

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000
shell-use expect text "fish abbreviations"
shell-use close
```

#### Test 2: Abbreviation expansion works

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Type an abbreviation and verify expansion
shell-use type "testabb world"
shell-use wait idle
# testabb expands to "hello world", so result is "hello world world"
shell-use expect text "hello world world"
shell-use close
```

#### Test 3: Non-abbreviation text passes through

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Type text that is NOT an abbreviation
shell-use type "notanabbreviation"
shell-use wait idle
# Should pass through unchanged (not an abbreviation)
shell-use expect text "notanabbreviation"
# Should NOT show expansion notification
shell-use expect text "Expanded" --not
shell-use close
```

#### Test 4: Word-boundary matching (no false positives)

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Type text that contains abbreviation as substring (not word boundary)
shell-use type "testabb extra"
shell-use wait idle
# Should NOT expand because it's not a standalone word
shell-use expect text "testabb extra"
shell-use close
```

#### Test 5: /abbr command lists abbreviations

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Run /abbr command
shell-use type "/abbr"
shell-use wait idle
shell-use expect text "testabb"
shell-use expect text "hello world"
shell-use close
```

#### Test 6: /abbr with filter

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Run /abbr with filter
shell-use type "/abbr testabb"
shell-use wait idle
shell-use expect text "testabb"
shell-use close
```

#### Test 7: Bash commands are not expanded

```bash
shell-use open --shell bash
shell-use submit "pi -e /var/home/l/git/pi-extensions/pi-use-fish-shell-aliases-and-abbr/pi-use-fish-shell-aliases-and-abbr.ts"
shell-use wait text "Loaded" --timeout 10000

# Type a bash command with ! prefix
shell-use type "! testabb"
shell-use wait idle
# Should NOT expand
shell-use expect text "testabb"
shell-use close
```

#### Test 8: Cleanup

```bash
# Remove test abbreviation
fish -c "abbr --erase testabb"
```

## Performance Considerations

- Abbreviations are loaded once at session start, not per-input
- Expansion uses a simple regex loop over ~185 abbreviations — negligible performance impact
- Sorting by length descending ensures longest-match-first (prevents `g` from matching when `gc` should)

## References

- Fish shell documentation: `abbr --show` format
- Pi extension docs: `/var/home/l/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- Input transform example: `examples/extensions/input-transform.ts`
- Commands example: `examples/extensions/commands.ts`
