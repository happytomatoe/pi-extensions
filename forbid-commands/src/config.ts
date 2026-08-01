import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PatternRule, PermissionState, DecisionStrategy, Config } from "./types";

function unescapeYamlDoubleQuoted(s: string): string {
  return s.replace(/\\("|\\)/g, "$1");
}
function findConfig(): string | null {
  const home = homedir();
  const candidates = [
    join(home, ".pi", "agent", "forbid-commands.yaml"),
    join(home, ".pi", "agent", "forbid-commands.yml"),
    join(process.cwd(), ".pi", "forbid-commands.yaml"),
    join(process.cwd(), ".pi", "forbid-commands.yml"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let currentKey: string | null = null;
  let currentList: Record<string, string | undefined>[] | null = null;
  let currentObj: Record<string, string | undefined> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line || /^\s*$/.test(line)) continue;

    const topScalar = line.match(/^(\w[\w]*):\s*("?(.*?)"?\s*)?$/);
    if (topScalar && !line.match(/^\s+/)) {
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
      if (val === "true") {
        result[key] = true;
        currentKey = null;
        continue;
      }
      if (val === "false") {
        result[key] = false;
        currentKey = null;
        continue;
      }
      result[key] = val;
      currentKey = null;
      continue;
    }

    const listObjStart = line.match(/^\s+-\s+(regex|pattern):\s*"(.+?)"\s*$/);
    if (listObjStart && currentKey) {
      if (!currentList) currentList = [];
      const [, key, value] = listObjStart;
      currentObj = { [key]: unescapeYamlDoubleQuoted(value) };
      currentList.push(currentObj);
      continue;
    }

    const listItem = line.match(/^\s+-\s+"?(.+?)"?\s*$/);
    if (listItem && currentKey) {
      const val = listItem[1];
      if (!currentList) currentList = [];
      currentList.push(val as unknown as Record<string, string | undefined>);
      currentList.push({ pattern: val });
      currentObj = null;
      continue;
    }

    const objProp = line.match(/^\s+(message|regex|pattern):\s*"?(.+?)"?\s*$/);
    if (objProp && currentObj) {
      const [, key, value] = objProp;
      currentObj[key] = unescapeYamlDoubleQuoted(value);
      continue;
    }
  }

  if (currentKey && currentList) {
    result[currentKey] = currentList;
  } else if (currentKey && currentObj) {
    result[currentKey] = [currentObj];
  }

  return result;
}
function normalizeRawRule(raw: Record<string, string | undefined>, state: PermissionState): PatternRule {
  const rule: PatternRule = { state };
  if (raw.regex) rule.regex = raw.regex;
  if (raw.pattern) rule.pattern = raw.pattern;
  if (raw.message) rule.message = raw.message;
  return rule;
}

function normalizeRules(items: unknown[], state: PermissionState): PatternRule[] {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    if (item && typeof item === "object") {
      return normalizeRawRule(item as Record<string, string | undefined>, state);
    }
    if (typeof item === "string") {
      return { pattern: item, state };
    }
    return { state };
  });
}

export function loadConfig(): Config {
  const defaultConfig: Config = {
    use_dcg: true,
    decision_strategy: "most-restrictive",
    deny: [
      { pattern: "shutdown *", state: "deny", message: "Shutdown is forbidden" },
      { pattern: "reboot", state: "deny", message: "Reboot is forbidden" },
      { pattern: "halt", state: "deny", message: "Halt is forbidden" },
      { pattern: "poweroff", state: "deny", message: "Power off is forbidden" },
      { pattern: "killall *pi*", state: "deny", message: "Killing pi processes is forbidden" },
      { pattern: "kill *", state: "deny", message: "Killing processes by PID is forbidden" },
      { pattern: "pkill *brave*", state: "deny", message: "Killing Brave processes is forbidden" },
      { pattern: "su *", state: "deny", message: "Switching user is forbidden" },
      { pattern: "ssh *", state: "deny", message: "SSH is blocked. Use the shell-use skill for terminal connections and interactive sessions." },
      { pattern: "ssh", state: "deny", message: "SSH is blocked. Use the shell-use skill for terminal connections and interactive sessions." },
      { pattern: "scp *", state: "deny", message: "SCP is blocked (uses SSH). Use shell-use skill for file transfers or sftp." },
      { pattern: "sftp *", state: "deny", message: "SFTP is blocked (uses SSH). Use shell-use skill for interactive file transfers." },
      { pattern: "sftp", state: "deny", message: "SFTP is blocked (uses SSH). Use shell-use skill for interactive file transfers." },
    ],
    confirm: [
      { pattern: "rm -rf *", state: "ask", message: "Allow rm -rf?" },
      { pattern: "rm *", state: "ask", message: "Allow rm?" },
      { pattern: "sudo *", state: "ask", message: "Allow sudo?" },
      { pattern: "git push --force *", state: "ask", message: "Allow force push?" },
      { pattern: "git push *", state: "ask", message: "Allow git push?" },
      { pattern: "git reset --hard *", state: "ask", message: "Allow hard reset?" },
      { pattern: "docker system prune *", state: "ask", message: "Allow docker prune?" },
      { pattern: "kubectl delete *", state: "ask", message: "Allow kubectl delete?" },
    ],
    allow: [
      { pattern: "ls *", state: "allow" },
      { pattern: "cat *", state: "allow" },
      { pattern: "head *", state: "allow" },
      { pattern: "tail *", state: "allow" },
      { pattern: "grep *", state: "allow" },
      { pattern: "find *", state: "allow" },
      { pattern: "wc *", state: "allow" },
      { pattern: "file *", state: "allow" },
      { pattern: "stat *", state: "allow" },
      { pattern: "du *", state: "allow" },
      { pattern: "df *", state: "allow" },
      { pattern: "git status", state: "allow" },
      { pattern: "git log *", state: "allow" },
      { pattern: "git diff *", state: "allow" },
      { pattern: "git show *", state: "allow" },
      { pattern: "git branch *", state: "allow" },
      { pattern: "git remote *", state: "allow" },
      { pattern: "git stash list", state: "allow" },
      { pattern: "git tag *", state: "allow" },
      { pattern: "mkdir *", state: "allow" },
      { pattern: "touch *", state: "allow" },
      { pattern: "cp *", state: "allow" },
      { pattern: "mv *", state: "allow" },
      { pattern: "ln *", state: "allow" },
      { pattern: "sed -i *", state: "allow" },
      { pattern: "tee *", state: "allow" },
      { pattern: "xargs *", state: "allow" },
    ],
  };

  const configPath = findConfig();
  if (!configPath) return defaultConfig;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseSimpleYaml(raw);

    const strategy = parsed.decision_strategy as string | undefined;
    const validStrategy: DecisionStrategy | undefined =
      strategy === "most-restrictive" || strategy === "last-match" || strategy === "first-match"
        ? strategy
        : undefined;

    return {
      use_dcg: parsed.use_dcg !== undefined ? Boolean(parsed.use_dcg) : defaultConfig.use_dcg,
      decision_strategy: validStrategy ?? defaultConfig.decision_strategy,
      deny: Array.isArray(parsed.deny) ? normalizeRules(parsed.deny, "deny") : defaultConfig.deny,
      confirm: Array.isArray(parsed.confirm) ? normalizeRules(parsed.confirm, "ask") : defaultConfig.confirm,
      allow: Array.isArray(parsed.allow) ? normalizeRules(parsed.allow, "allow") : defaultConfig.allow,
    };
  } catch (e) {
    console.error("[forbid-commands] failed to load config:", e);
    return defaultConfig;
  }
}
