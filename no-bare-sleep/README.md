# no-bare-sleep

A [Pi](https://github.com/happytomatoe/pi) extension that blocks the agent from using bare `sleep` commands longer than 10 seconds.

Instead of fixed waits, the agent is nudged to use polling via `wait_until`, which is faster, more reliable, and avoids wasting time.

## What it does

- Intercepts `bash` tool calls containing `sleep <N>` where N > 10
- Blocks the call and returns a helpful message suggesting `wait_until` alternatives
- Installs a `wait_until` script to `~/.local/bin/` on session start
- Installs a `run_bg` script for running long processes in background with output tracking

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

## `run_bg`

For long-running processes (>1 minute), use `run_bg` to run in the background with output tracking:

```bash
run_bg <description> <cmd...>
```

Example:

```bash
# Start a long build in background
run_bg "npm build" npm run build
# Output: Started 'npm build' with PID: 12345
#         Files: stdout=/tmp/npm_build.stdout.log stderr=/tmp/npm_build.stderr.log combined=/tmp/npm_build.log

# Wait for completion (max 3 minutes to keep cache hot)
wait_until 180 5 "build complete" kill -0 12345 2>/dev/null

# Read the output
cat /tmp/npm_build.stdout.log
cat /tmp/npm_build.stderr.log
```

This approach:
- Saves stdout to `/tmp/<description>.stdout.log`
- Saves stderr to `/tmp/<description>.stderr.log`
- Saves combined output to `/tmp/<description>.log`
- Returns the PID for polling with `wait_until`
- Keeps the context cache hot by not waiting more than 3 minutes

## License

MIT
