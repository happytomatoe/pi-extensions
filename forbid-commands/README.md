# forbid-commands

A [Pi](https://github.com/happytomatoe/pi) extension that blocks destructive shell commands.

## How it works

Two layers of protection:

1. **dcg** — delegates to [dcg](https://github.com/anthropics/dcg) (`dcg --robot test <command>`) for comprehensive destructive command detection (rm, git push, secrets, ssh, env, etc.)
2. **Custom patterns** — regex checks for commands dcg doesn't cover:
   - Process killing (`killall`, `kill <pid>`, `pkill`)
   - Privilege escalation (`su`)
   - System destruction (`shutdown`, `reboot`, `halt`, `poweroff`)

Fails open if dcg is not installed — a missing dcg never wedges Pi.

## Usage

Add to your Pi config:

```json
{
  "extensions": {
    "forbid-commands": "npm:i:--registry npm:@earendil-works/forbid-commands"
  }
}
```

Or locally:

```json
{
  "extensions": [
    "+extensions/forbid-commands/forbid-commands.ts"
  ]
}
```

## License

MIT
