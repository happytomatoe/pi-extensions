#!/usr/bin/env node
/**
 * CLI tool for checking commands against forbid-commands rules
 * 
 * Usage:
 *   node dist/cli.js "command"
 *   echo "command" | node dist/cli.js
 * 
 * Exit codes:
 *   0 = allow
 *   2 = deny (blocked)
 * 
 * Output: one word (allow/deny)
 */

import { loadConfig } from "./config";
import { wildcardMatch } from "./wildcard-utils";
import { normalizeCommand } from "./normalize";
import { pathToFileURL } from "node:url";

export interface CheckResult {
  state: "allow" | "deny";
  rule?: {
    pattern?: string;
    regex?: string;
    message?: string;
  };
}

export function checkCommand(command: string): CheckResult {
  const config = loadConfig();
  const normalized = normalizeCommand(command);
  
  // Get all text versions to try (original + normalized)
  const textsToTry = [command, normalized];
  
  // Hard-deny rules are a separate, non-overridable tier.
  for (const text of textsToTry) {
    for (const rule of config.hard_deny ?? []) {
      if (matchesRule(rule, text)) {
        return { state: "deny", rule };
      }
    }
  }

  // Ordinary rules retain last-match-wins behavior for scoped exceptions.
  // A later allow can override an ordinary deny, but never a hard deny.
  const allRules: Array<{ state: "allow" | "deny"; pattern?: string; regex?: string; message?: string }> = [
    ...config.deny.map(r => ({ ...r, state: "deny" as const })),
    ...config.allow.map(r => ({ ...r, state: "allow" as const })),
  ];
  
  // Find the last matching rule across all text versions
  let matchedRule: typeof allRules[number] | undefined;
  
  for (const text of textsToTry) {
    for (const rule of allRules) {
      if (matchesRule(rule, text)) {
        matchedRule = rule;
      }
    }
  }
  
  return matchedRule ? { state: matchedRule.state, rule: matchedRule } : { state: "allow" };
}

function matchesRule(rule: { pattern?: string; regex?: string }, text: string): boolean {
  if (rule.regex) {
    try {
      return new RegExp(rule.regex, "i").test(text);
    } catch {
      return false;
    }
  }
  if (rule.pattern) {
    return wildcardMatch(rule.pattern, text);
  }
  return false;
}

async function main() {
  let command: string;
  
  // Get command from args or stdin
  if (process.argv.length > 2) {
    // Command from arguments
    command = process.argv.slice(2).join(" ");
  } else {
    // Command from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    command = Buffer.concat(chunks).toString("utf-8").trim();
  }
  
  if (!command) {
    console.error("No command provided");
    process.exit(1);
  }
  
  const result = checkCommand(command);
  console.log(result.state);
  
  switch (result.state) {
    case "allow":
      process.exit(0);
    case "deny":
      process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
