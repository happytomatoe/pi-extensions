import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Fallback content for run_bg script.
const RUN_BG_FALLBACK = `#!/bin/bash
set -euo pipefail
if [ \$# -lt 2 ]; then
    echo "Usage: run_bg <description> <cmd...>" >&2
    exit 1
fi
DESCRIPTION=\$1
shift
SAFE_DESC=$(echo \$DESCRIPTION | tr ' /:' '_' | tr -cd '[:alnum:]_.-')
STDOUT_FILE="/tmp/\${SAFE_DESC}.stdout.log"
STDERR_FILE="/tmp/\${SAFE_DESC}.stderr.log"
COMBINED_FILE="/tmp/\${SAFE_DESC}.log"
PID_FILE="/tmp/\${SAFE_DESC}.pid"
> \$STDOUT_FILE
> \$STDERR_FILE
> \$COMBINED_FILE
\$@ > >(tee \$STDOUT_FILE >> \$COMBINED_FILE) 2> >(tee \$STDERR_FILE >&2 >> \$COMBINED_FILE) &
PID=\$!
echo \$PID > \$PID_FILE
echo "Started '$DESCRIPTION' with PID: \$PID"
echo "Files: stdout=\$STDOUT_FILE stderr=\$STDERR_FILE combined=\$COMBINED_FILE"
`;

// Fallback content if the bundled bin/ file is somehow missing.
const WAIT_UNTIL_FALLBACK = `#!/bin/bash\nwait_until() {\n  local timeout=$1 interval=$2 desc=$3; shift 3\n  local elapsed=0\n  until "$@"; do\n    if (( elapsed >= timeout )); then\n      echo "Timed out after \${timeout}s waiting for: $desc" >&2\n      return 1\n    fi\n    sleep "$interval"\n    (( elapsed += interval ))\n  done\n}\nwait_until "$@"\n`;

function ensureWaitUntil(): void {
  const target = join(homedir(), ".local", "bin", "wait_until");
  const src = join(__dirname, "bin", "wait_until");
  let content: string;
  try {
    content = readFileSync(src, "utf8");
  } catch {
    content = WAIT_UNTIL_FALLBACK;
  }
  try {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      writeFileSync(target, content, { mode: 0o755 });
      chmodSync(target, 0o755);
    }
  } catch {
    /* best-effort; ignore if homedir/.local/bin is not writable */
  }
}

function ensureRunBg(): void {
  const target = join(homedir(), ".local", "bin", "run_bg");
  const src = join(__dirname, "bin", "run_bg");
  let content: string;
  try {
    content = readFileSync(src, "utf8");
  } catch {
    content = RUN_BG_FALLBACK;
  }
  try {
    if (!existsSync(target) || readFileSync(target, "utf8") !== content) {
      writeFileSync(target, content, { mode: 0o755 });
      chmodSync(target, 0o755);
    }
  } catch {
    /* best-effort */
  }
}

export default function (pi: ExtensionAPI): void {
  const BARE_SLEEP = /\bsleep\s+([\d.]+)/i;
  const ALLOWED = /wait_until|run_bg|usr\/bin\/sleep/;

  // Recreate the bundled wait_until script on the PATH after (re)install.
  pi.on("session_start", () => {
    ensureWaitUntil();
    ensureRunBg();
  });

  pi.on("tool_call", (event) => {
    if (!isToolCallEventType("bash", event)) return undefined;

    const command = event.input.command;
    const match = BARE_SLEEP.exec(command);
    
    if (match && !ALLOWED.test(command)) {
      const duration = parseFloat(match[1]);
      
      // Allow sleep if duration is 10 seconds or less
      if (duration <= 10) {
        return undefined;
      }
      
      return {
        block: true,
        reason:
          `Sleep command with duration ${duration}s is blocked (max 10s allowed). ` +
          "Prefer polling with `wait_until <timeout> <interval> <desc> <cmd...>` instead of a fixed wait. " +
          "For long-running processes (>1min), use `run_bg <desc> <cmd...>` to run in background with output tracking. " +
          "Examples: " +
          "`wait_until 60 2 \"server on :3000\" curl -sf http://localhost:3000/health`; " +
          "`run_bg \"npm build\" npm run build` then `wait_until 180 5 \"build complete\" kill -0 $PID`; " +
          "`wait_until 45 3 \"port 5432 open\" bash -c 'exec 3<>/dev/tcp/localhost/5432'`"
      };
    }

    return undefined;
  });
}
