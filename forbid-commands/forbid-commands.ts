import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

const DCG_BIN = process.env.DCG_BIN ?? "dcg";

// Custom patterns for rules dcg doesn't cover.
// Everything else (rm, git, podman, secrets, ssh, env, etc.) is handled by dcg.
const FORBIDDEN_PATTERNS = [
  // Process killing - dcg doesn't cover kill/pkill
  { pattern: /killall.*pi/i, message: "Killing pi processes is forbidden" },
  { pattern: /kill\s+\d+/, message: "Killing processes by PID is forbidden" },
  { pattern: /pkill\s+-f\s+brave/i, message: "Killing Brave processes is forbidden" },

  // Privilege escalation (allow su to user r for pi-agent isolation)
  { pattern: /^su\s+(?!r(\s|$))(?!-\s*r(\s|$))/, message: "Switching user via su is forbidden (except su - r)" },

  // System destruction - dcg doesn't cover shutdown/reboot/halt/poweroff
  { pattern: /^shutdown/, message: "Shutdown is forbidden" },
  { pattern: /^reboot/, message: "Reboot is forbidden" },
  { pattern: /^halt/, message: "Halt is forbidden" },
  { pattern: /^poweroff/, message: "Power off is forbidden" },

  // Python forbidden - use uv instead
  // { pattern: /(?:^|\s)python\b/, message: "Using 'python' is forbidden. Use 'uv' instead (e.g., 'uv run python', 'uv pip install')." },
  // { pattern: /(?:^|\s)python3\b/, message: "Using 'python3' is forbidden. Use 'uv' instead (e.g., 'uv run python', 'uv pip install')." },
];

function dcgDecision(command: string): Promise<{ deny: boolean; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn(DCG_BIN, ["--robot", "test", command], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    // Fail open if dcg can't be found / spawned, so a broken install never
    // wedges Pi. Flip this to resolve({ deny: true, ... }) to fail closed.
    child.on("error", () => resolve({ deny: false, reason: "" }));

    child.on("close", (code) => {
      if (code === 1) {
        // Denied. The reason lives in the robot-mode JSON.
        let reason = "Blocked by dcg (destructive command).";
        try {
          const parsed = JSON.parse(stdout);
          if (parsed?.reason) reason = parsed.reason;
          if (parsed?.rule_id) reason += ` [${parsed.rule_id}]`;
        } catch {
          /* keep the default reason */
        }
        resolve({ deny: true, reason });
      } else {
        // 0 = allowed; >=3 = dcg error -> fail open.
        resolve({ deny: false, reason: "" });
      }
    });
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command || "";

    // Layer 1: Delegate to dcg for comprehensive destructive command detection
    const { deny, reason } = await dcgDecision(command);
    if (deny) {
      return { block: true, reason };
    }

    // Layer 2: Fast regex check against our custom patterns (dcg misses these)
    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(command)) {
        return { block: true, reason: message };
      }
    }
  });
}
