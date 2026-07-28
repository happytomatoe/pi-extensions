# no-bare-sleep

A [Pi](https://github.com/happytomatoe/pi) extension that blocks the agent from using bare `sleep` commands longer than 10 seconds.

Instead of fixed waits, the agent is nudged to use polling via `wait_until`, which is faster, more reliable, and avoids wasting time.

## What it does

- Intercepts `bash` tool calls containing `sleep <N>` where N > 10
- Blocks the call and returns a helpful message suggesting `wait_until` alternatives
- Installs a `wait_until` script to `~/.local/bin/` on session start

## Usage

Add to your Pi config:

```json
{
  "extensions": {
    "no-bare-sleep": "npm:i:--registry npm:@earendil-works/no-bare-sleep"
  }
}
```

## `wait_until`

The extension installs a helper script:

```bash
wait_until <timeout> <interval> <description> <cmd...>
```

Examples:

```bash
wait_until 60 2 "server on :3000" curl -sf http://localhost:3000/health
wait_until 30 1 "build ready" test -f ./dist/app.js
wait_until 45 3 "port 5432 open" bash -c 'exec 3<>/dev/tcp/localhost/5432'
```

## License

MIT
