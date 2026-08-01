import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatternRule {
  pattern: string;   // glob-like: "*" matches anything
  message?: string;  // custom block/confirm message
}

interface Config {
  /** Enable DCG as a fallback (default: true if dcg is installed) */
  use_dcg?: boolean;
  /** Deny these commands outright */
  deny: PatternRule[];
  /** Ask user for confirmation before running */
  confirm: PatternRule[];
  /** Allow without asking (skip DCG too) */
  allow: PatternRule[];
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function findConfig(): string | null {
  const home = homedir();
  const candidates = [
    // Global
    join(home, ".pi", "agent", "forbid-commands.yaml"),
    join(home, ".pi", "agent", "forbid-commands.yml"),
    // Project-local
    join(process.cwd(), ".pi", "forbid-commands.yaml"),
    join(process.cwd(), ".pi", "forbid-commands.yml"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Minimal YAML-ish parser for our simple config format.
 * Supports:
 *   key: value
 *   key:
 *     - item
 *     - item
 *   list of objects:
 *     - pattern: "*.csv"
 *       message: "Allow CSV exports"
 */
function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let currentKey: string | null = null;
  let currentList: Record<string, string>[] | null = null;
  let currentObj: Record<string, string> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd(); // strip comments
    if (!line || /^\s*$/.test(line)) continue;

    // Top-level key: value or key: (list follows)
    const topScalar = line.match(/^(\w[\w]*):\s*("?(.*?)"?\s*)?$/);
    if (topScalar && !line.match(/^\s+/)) {
      // save previous list object
      if (currentKey && currentList) {
        result[currentKey] = currentList;
        currentList = null;
        currentObj = null;
      }
      const [, key, val] = topScalar;
      if (!val || val.trim() === "") {
        currentKey = key;
        currentList = [];
        continue;
      }
      // parse boolean-ish
      if (val === "true") { result[key] = true; currentKey = null; continue; }
      if (val === "false") { result[key] = false; currentKey = null; continue; }
      result[key] = val;
      currentKey = null;
      continue;
    }

    // List item object: - pattern: "..."  (must be checked before the generic list item regex)
    const listObjStart = line.match(/^\s+-\s+pattern:\s*"?(.+?)"?\s*$/);
    if (listObjStart && currentKey) {
      if (!currentList) currentList = [];
      currentObj = { pattern: listObjStart[1] };
      currentList.push(currentObj);
      continue;
    }

    // List item: - something
    const listItem = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (listItem && currentKey) {
      const val = listItem[1];
      if (!currentList) currentList = [];
      currentList.push(val as any);
      continue;
    }

    // Object property inside list item:   message: "..."
    const objProp = line.match(/^\s+message:\s*"?(.+?)"?\s*$/);
    if (objProp && currentObj) {
      currentObj.message = objProp[1];
      continue;
    }
  }

  // flush
  if (currentKey && currentList) {
    result[currentKey] = currentList;
  } else if (currentKey && currentObj) {
    result[currentKey] = [currentObj];
  }

  return result;
}

function loadConfig(): Config {
  const defaultConfig: Config = {
    use_dcg: true,
    deny: [
      { pattern: "shutdown *", message: "Shutdown is forbidden" },
      { pattern: "reboot", message: "Reboot is forbidden" },
      { pattern: "halt", message: "Halt is forbidden" },
      { pattern: "poweroff", message: "Power off is forbidden" },
      { pattern: "killall *pi*", message: "Killing pi processes is forbidden" },
      { pattern: "kill *", message: "Killing processes by PID is forbidden" },
      { pattern: "pkill *brave*", message: "Killing Brave processes is forbidden" },
      { pattern: "*ssh*", message: "Use shell-use" },
    ],
    confirm: [
      { pattern: "rm *", message: "Allow rm?" },
      { pattern: "rm -rf *", message: "Allow rm -rf?" },
      { pattern: "sudo *", message: "Allow sudo?" },
      { pattern: "git push *", message: "Allow git push?" },
      { pattern: "git push --force *", message: "Allow force push?" },
    ],
    allow: [
      { pattern: "ls *" },
      { pattern: "cat *" },
      { pattern: "head *" },
      { pattern: "tail *" },
      { pattern: "grep *" },
      { pattern: "find *" },
      { pattern: "git status" },
      { pattern: "git diff *" },
      { pattern: "git log *" },
      { pattern: "git branch *" },
      { pattern: "mkdir *" },
      { pattern: "touch *" },
      { pattern: "cp *" },
      { pattern: "mv *" },
    ],
  };

  const configPath = findConfig();
  if (!configPath) return defaultConfig;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseSimpleYaml(raw);
    return {
      use_dcg: parsed.use_dcg !== undefined ? Boolean(parsed.use_dcg) : defaultConfig.use_dcg,
      deny: Array.isArray(parsed.deny) ? parsed.deny : defaultConfig.deny,
      confirm: Array.isArray(parsed.confirm) ? parsed.confirm : defaultConfig.confirm,
      allow: Array.isArray(parsed.allow) ? parsed.allow : defaultConfig.allow,
    };
  } catch (e) {
    console.error("[forbid-commands] failed to load config:", e);
    return defaultConfig;
  }
}

// ---------------------------------------------------------------------------
// Wildcard matching (fnmatch-style)
// ---------------------------------------------------------------------------

function wildcardMatch(pattern: string, text: string, cwd?: string): boolean {
  // Expand $CWD placeholder to actual working directory
  let expandedPattern = pattern;
  if (cwd && pattern.includes("$CWD")) {
    // Escape the cwd for use in regex (before glob conversion)
    const escapedCwd = cwd.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    expandedPattern = pattern.replace(/\$CWD/g, escapedCwd);
  }

  // Convert glob pattern to regex
  const regexStr = "^" + expandedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")  // escape regex special chars
    .replace(/\*/g, ".*")                     // * → .*
    .replace(/\?/g, ".")                      // ? → .
    + "$";
  return new RegExp(regexStr, "i").test(text);
}

function matchRules(rules: PatternRule[], command: string, cwd?: string): PatternRule | null {
  // Last match wins (like shell PATH)
  let matched: PatternRule | null = null;
  for (const rule of rules) {
    if (wildcardMatch(rule.pattern, command, cwd)) {
      matched = rule;
    }
  }
  return matched;
}

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
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // console.log('[forbid-commands] Extension loaded!');
  let config = loadConfig();
  // console.log('[forbid-commands] Deny rules:', config.deny.map(r => r.pattern));
  let dcgAvailable = config.use_dcg && hasDcg();

  // Reload config on session start
  pi.on("session_start", () => {
    config = loadConfig();
    dcgAvailable = config.use_dcg && hasDcg();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input?.command || "";
    // console.log('[forbid-commands] Tool call:', command);
    // 1. Check DENY rules — hard block, no questions
    const denied = matchRules(config.deny, command, process.cwd());
    if (denied) {
      return {
        block: true,
        reason: denied.message || `Command denied: ${command}`,
      };
    }

    // 2. Check ALLOW rules — skip confirmation and DCG
    const allowed = matchRules(config.allow, command, process.cwd());
    if (allowed) {
      return undefined;
    }

    // 3. Check CONFIRM rules — ask user
    const needsConfirm = matchRules(config.confirm, command, process.cwd());
    if (needsConfirm) {
      if (!ctx.hasUI) {
        // Non-interactive: block by default
        return {
          block: true,
          reason: needsConfirm.message || `Command requires confirmation (no UI): ${command}`,
        };
      }

      const message = needsConfirm.message || `Allow command?`;
      const choice = await ctx.ui.select(
        `${message}\n\n  ${command}`,
        ["Yes", "No"],
      );

      if (choice !== "Yes") {
        return { block: true, reason: "Blocked by user" };
      }
      return undefined;
    }

    // 4. Fallback to DCG if enabled and available
    if (dcgAvailable) {
      const { deny, reason } = await dcgDecision(command);
      if (deny) {
        return { block: true, reason };
      }
    }

    // 5. Default: allow
    return undefined;
  });
}
