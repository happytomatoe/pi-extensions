# forbid-commands

A [Pi](https://github.com/happytomatoe/pi) extension that blocks shell commands via YAML config + optional DCG fallback.

## How it works

1. Match **deny** rules → block
2. Match **allow** rules → skip DCG
3. Fallback to **DCG** (if enabled)
4. Default: allow

## Config

Place at:
- **Global:** `~/.pi/agent/forbid-commands.yaml`
- **Project:** `.pi/forbid-commands.yaml`

```yaml
use_dcg: true
decision_strategy: most-restrictive  # or: last-match, first-match

deny:
  - pattern: "sudo *"
    message: "Sudo is forbidden"
  - regex: "^\\s*git\\s+push\\s+--force"
    message: "Force push is forbidden"

allow:
  - pattern: "ls *"
  - pattern: "git status"
  - pattern: "rm /tmp/*"
```

## Pattern Syntax

- `*` matches anything (glob-style)
- Supports `$CWD` expansion for current directory
- `regex` field for regex patterns

## Fork Protection

Blocks `gh pr create` targeting upstream when working on forks:

```yaml
block_pr_create_for_fork_upstream:
  enabled: true
  exempt_repos: []
```

## CLI

```bash
just check "echo hello"    # → allow
just check "sudo ls"       # → deny
```

## Install

From the parent `pi-extensions` repo:

```bash
just install    # interactive picker
just install-all   # install all extensions
```

This symlinks the config to `~/.pi/agent/forbid-commands.yaml` automatically.

## License

MIT
