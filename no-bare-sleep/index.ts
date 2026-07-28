import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

export default function (pi: ExtensionAPI): void {
  const BARE_SLEEP = /\bsleep\s+([\d.]+)/i;
  const ALLOWED = /wait_until|usr\/bin\/sleep/;

  // Recreate the bundled wait_until script on the PATH after (re)install.
  pi.on("session_start", () => {
    ensureWaitUntil();
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
          "Examples: " +
          "`wait_until 60 2 \"server on :3000\" curl -sf http://localhost:3000/health`; " +
          "`wait_until 30 1 \"build ready\" test -f ./dist/app.js`; " +
          "`wait_until 45 3 \"port 5432 open\" bash -c 'exec 3<>/dev/tcp/localhost/5432'`"
      };
    }

    return undefined;
  });
}
