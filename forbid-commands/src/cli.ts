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
import { initParser, parseBash, isParserReady } from "./parser";
import { enumerateCommands } from "./command-enumerator";
import { evaluateCommand, aggregateResults } from "./evaluator";

export interface CheckResult {
  state: "allow" | "deny";
  rule?: {
    pattern?: string;
    regex?: string;
    message?: string;
  };
}

export async function checkCommand(command: string): Promise<CheckResult> {
  const config = loadConfig();
  const allRules = [...config.deny, ...config.allow];
  const cwd = process.cwd();

  // Try parser-based evaluation first (handles chained commands correctly)
  if (!isParserReady()) {
    await initParser();
  }
  if (isParserReady()) {
    const tree = parseBash(command);
    if (tree) {
      const commands = enumerateCommands(tree.rootNode);
      const results = commands.map(cmd => evaluateCommand(cmd, allRules, cwd));
      const result = aggregateResults(results, config.decision_strategy);
      return {
        state: result.state,
        rule: result.rule ? { pattern: result.rule.pattern, regex: result.rule.regex, message: result.rule.message } : undefined,
      };
    }
  }

  // Fallback: simple pattern matching on full command (legacy)
  const normalized = normalizeCommand(command);
  const textsToTry = [command, normalized];

  let matchedRule: typeof allRules[number] | undefined;
  for (const text of textsToTry) {
    for (const rule of allRules) {
      if (matchesRule(rule, text)) {
        matchedRule = rule;
      }
    }
  }

  return matchedRule ? { state: matchedRule.state ?? "allow", rule: matchedRule } : { state: "allow" };
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
  
  // Initialize parser for chained command support
  await initParser();
  
  const result = await checkCommand(command);
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
