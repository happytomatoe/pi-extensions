import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { initParser, parseBash, isParserReady } from "./src/parser";
import { enumerateCommands } from "./src/command-enumerator";
import { evaluateCommand, aggregateResults } from "./src/evaluator";
import type { PatternRule, Config } from "./src/types";
import { loadConfig as loadTypedConfig } from "./src/config";




// ---------------------------------------------------------------------------
// DCG integration (optional)
// ---------------------------------------------------------------------------

const DCG_BIN = process.env.DCG_BIN ?? "dcg";

function dcgDecision(command: string): Promise<{ deny: boolean; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn(DCG_BIN, ["--robot", "test", command], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    // Fail open if dcg not installed
    child.on("error", () => resolve({ deny: false, reason: "" }));

    child.on("close", (code) => {
      if (code === 1) {
        let reason = "Blocked by dcg (destructive command).";
        try {
          const parsed = JSON.parse(stdout);
          if (parsed?.reason) reason = parsed.reason;
          if (parsed?.rule_id) reason += ` [${parsed.rule_id}]`;
        } catch { /* keep default */ }
        resolve({ deny: true, reason });
      } else {
        resolve({ deny: false, reason: "" });
      }
    });
  });
}

function hasDcg(): boolean {
  try {
    spawn(DCG_BIN, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
// ---------------------------------------------------------------------------
// Shell cwd detection
// ---------------------------------------------------------------------------

function getShellCwd(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', 'echo $PWD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    
    child.on('close', () => {
      resolve(stdout.trim());
    });
    
    child.on('error', () => {
      resolve(process.cwd());
    });
  });
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let typedConfig = loadTypedConfig();
  let dcgAvailable = typedConfig.use_dcg && hasDcg();

  pi.on("session_start", async () => {
    await initParser();
    typedConfig = loadTypedConfig();
    dcgAvailable = typedConfig.use_dcg && hasDcg();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input?.command || "";
    const cwd = await getShellCwd();

    if (isParserReady()) {
      const tree = parseBash(command);
      if (tree) {
        const commands = enumerateCommands(tree.rootNode);
        const allRules = [...typedConfig.deny, ...typedConfig.confirm, ...typedConfig.allow];
        const results = commands.map(cmd => evaluateCommand(cmd, allRules, cwd));
        const result = aggregateResults(results, typedConfig.decision_strategy);

        if (result.state === "deny") {
          return {
            block: true,
            reason: result.rule?.message || `Command denied: ${result.command}`,
          };
        }

        if (result.state === "ask") {
          if (!ctx.hasUI) {
            return {
              block: true,
              reason: result.rule?.message || `Command requires confirmation (no UI): ${result.command}`,
            };
          }

          const message = result.rule?.message || `Allow command?`;
          const choice = await ctx.ui.select(
            `${message}\n\n  ${result.command}`,
            ["Yes", "No"],
          );

          if (choice !== "Yes") {
            return { block: true, reason: "Blocked by user" };
          }
          return undefined;
        }

        return undefined;
      }
    }

    const allRules = [...typedConfig.deny, ...typedConfig.confirm, ...typedConfig.allow];
    const results = [{ text: command }].map(cmd => evaluateCommand({ text: cmd.text }, allRules, cwd));
    const result = aggregateResults(results, typedConfig.decision_strategy);

    if (result.state === "deny") {
      return {
        block: true,
        reason: result.rule?.message || `Command denied: ${result.command}`,
      };
    }

    if (result.state === "ask") {
      if (!ctx.hasUI) {
        return {
          block: true,
          reason: result.rule?.message || `Command requires confirmation (no UI): ${result.command}`,
        };
      }

      const message = result.rule?.message || `Allow command?`;
      const choice = await ctx.ui.select(
        `${message}\n\n  ${result.command}`,
        ["Yes", "No"],
      );

      if (choice !== "Yes") {
        return { block: true, reason: "Blocked by user" };
      }
      return undefined;
    }

    if (dcgAvailable) {
      const { deny, reason } = await dcgDecision(command);
      if (deny) {
        return { block: true, reason };
      }
    }

    return undefined;
  });
}
