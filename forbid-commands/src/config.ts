import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { PatternRule, PermissionState, DecisionStrategy, Config, BlockPrCreateForForkUpstreamConfig } from "./types";

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

    const listObjStart = line.match(/^\s+-\s+(regex|pattern):\s*(["'])(.*?)\2\s*$/);
    if (listObjStart && currentKey) {
      if (!currentList) currentList = [];
      const [, key, , value] = listObjStart;
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
function normalizeBlockPrCreateForForkUpstreamConfig(
  raw: Record<string, unknown> | undefined
): BlockPrCreateForForkUpstreamConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  return {
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
    exempt_repos: Array.isArray(raw.exempt_repos)
      ? (raw.exempt_repos as string[])
      : [],
  };
}

export function loadConfig(): Config {
  const defaultConfig: Config = {
    use_dcg: true,
    decision_strategy: "most-restrictive",
    hard_deny: [],
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
    // Broad wildcard allow rules are commented out (see forbid-commands.yaml
    // for rationale): with the default-allow fallback they were no-ops that
    // only risked silently overriding future deny/hard_deny rules for the
    // same command family, since allow is concatenated after deny and
    // evaluated last-match-wins. Only genuine exceptions to a deny rule
    // (the rm carve-outs) remain active.
    allow: [
      // { pattern: "ls *", state: "allow" },
      // { pattern: "cat *", state: "allow" },
      // { pattern: "head *", state: "allow" },
      // { pattern: "tail *", state: "allow" },
      // { pattern: "grep *", state: "allow" },
      // { pattern: "find *", state: "allow" },
      // { pattern: "wc *", state: "allow" },
      // { pattern: "file *", state: "allow" },
      // { pattern: "stat *", state: "allow" },
      // { pattern: "du *", state: "allow" },
      // { pattern: "df *", state: "allow" },
      // { pattern: "git status", state: "allow" },
      // { pattern: "git log *", state: "allow" },
      // { pattern: "git diff *", state: "allow" },
      // { pattern: "git show *", state: "allow" },
      // { pattern: "git branch *", state: "allow" },
      // { pattern: "git remote *", state: "allow" },
      // { pattern: "git stash list", state: "allow" },
      // { pattern: "git tag *", state: "allow" },
      // { pattern: "mkdir *", state: "allow" },
      // { pattern: "touch *", state: "allow" },
      // { pattern: "cp *", state: "allow" },
      // { pattern: "mv *", state: "allow" },
      // { pattern: "ln *", state: "allow" },
      // { pattern: "sed -i *", state: "allow" },
      // { pattern: "tee *", state: "allow" },
      // { pattern: "xargs *", state: "allow" },
    ],
    block_pr_create_for_fork_upstream: {
      enabled: true,
      exempt_repos: [],
    },
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
      hard_deny: Array.isArray(parsed.hard_deny)
        ? normalizeRules(parsed.hard_deny, "deny")
        : defaultConfig.hard_deny,
      allow: Array.isArray(parsed.allow) ? normalizeRules(parsed.allow, "allow") : defaultConfig.allow,
      block_pr_create_for_fork_upstream: parsed.block_pr_create_for_fork_upstream
        ? normalizeBlockPrCreateForForkUpstreamConfig(
            parsed.block_pr_create_for_fork_upstream as Record<string, unknown>
          )
        : defaultConfig.block_pr_create_for_fork_upstream,
    };
  } catch (e) {
    console.error("[forbid-commands] failed to load config:", e);
    return defaultConfig;
  }
}
