# forbid-commands

A [Pi](https://github.com/happytomatoe/pi) extension that blocks, confirms, or allows shell commands via a YAML config.

## Three Modes

| Mode | Behavior |
|------|----------|
| **deny** | Hard block — never runs, no questions |
| **confirm** | Asks user before running |
| **allow** | Runs silently, skips DCG too |

## How it works

1. Check **deny** rules → block immediately
2. Check **allow** rules → run silently
3. Check **confirm** rules → ask user
4. Fallback to **DCG** (if installed and enabled)
5. Default: allow

Last matching rule wins (like shell PATH).

## Config File

Place at one of:
- **Global:** `~/.pi/agent/forbid-commands.yaml`
- **Project:** `.pi/forbid-commands.yaml`

Project-local overrides global.

### Example Config

```yaml
use_dcg: true

# HARD BLOCK
deny:
  - pattern: "shutdown *"
    message: "Shutdown is forbidden"
  - pattern: "kill *"
    message: "Killing processes is forbidden"

# ASK USER
confirm:
  - pattern: "rm *"
    message: "Allow rm?"
  - pattern: "sudo *"
    message: "Allow sudo?"
  - pattern: "git push *"
    message: "Allow git push?"

# ALLOW SILENTLY
allow:
  - pattern: "ls *"
  - pattern: "cat *"
  - pattern: "git status"
  - pattern: "git diff *"
  - pattern: "mkdir *"
  - pattern: "cp *"
  - pattern: "mv *"
```

### Pattern Syntax

- `*` matches anything (glob-style)
- `rm *` matches `rm foo`, `rm -rf ./bar`, etc.
- `git push *` matches `git push`, `git push origin main`
- Exact match: `git status` (no wildcard)
### Allowing `rm` in Project Directories

The extension now detects the shell's current directory via `$PWD`, allowing patterns like `$CWD` to work correctly:

```yaml
allow:
  # Allow rm in current directory (uses shell cwd)
  - pattern: "rm $CWD/*"
  - pattern: "rm -rf $CWD/*"
```

**How it works:**
- The extension runs `echo $PWD` before evaluating commands
- This gets the shell's current directory (after any `cd` commands)
- `$CWD` in patterns is replaced with this directory
- Works for both absolute and relative paths in the current directory

**Example:** If you're in `/var/home/l/git/voice-to-text` and run:
```bash
rm /var/home/l/git/voice-to-text/.agents/skills/e2e-setup/SKILL.md
```
The pattern `rm $CWD/*` will match and allow it without confirmation.
### Options

| Key | Default | Description |
|-----|---------|-------------|
| `use_dcg` | `true` | Enable DCG as fallback for unmatched commands |

## Install

```bash
pi install git:github.com/happytomatoe/pi-extensions
```

Then run `pi config` to enable the extension.

## License

MIT
