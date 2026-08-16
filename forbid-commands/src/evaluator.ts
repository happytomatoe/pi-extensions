import type { BashCommand } from "./command-enumerator";
import type { PatternRule, EvaluationResult, DecisionStrategy, CommandPattern } from "./types";
import { regexMatch } from "./regex-utils";
import { wildcardMatch } from "./wildcard-utils";
import { getMatchingTexts } from "./normalize";
import { parseCommandString, patternMatches } from "./command-parser";

function matchesRule(rule: PatternRule, text: string, cwd?: string): boolean {
  // Try structured matching first if rule has parsed pattern
  // Skip structured matching for patterns with wildcards (they need regex)
  if (rule.parsed && !rule.pattern?.includes('*')) {
    const actual = parseCommandString(text);
    if (patternMatches(rule.parsed, actual)) {
      return true;
    }
    // If structured matching was attempted but failed, fall through to regex/wildcard
  }
  
  // Fall back to regex/wildcard
  if (rule.regex) {
    return regexMatch(rule.regex, text, cwd);
  }
  if (rule.pattern) {
    return wildcardMatch(rule.pattern, text, cwd);
  }
  return false;
}


function matchRulesLastWins(rules: PatternRule[], text: string, cwd?: string): PatternRule | undefined {
  let matched: PatternRule | undefined;
  for (const rule of rules) {
    if (matchesRule(rule, text, cwd)) {
      matched = rule;
    }
  }
  return matched;
}

export function evaluateCommand(
  command: BashCommand,
  rules: PatternRule[],
  cwd?: string
): EvaluationResult {
  if (command.wrapperKind) {
    // Try matching against all text versions (original and normalized)
    const textsToTry = getMatchingTexts(command.text);
    let wrapperRule: PatternRule | undefined;
    for (const text of textsToTry) {
      wrapperRule = matchRulesLastWins(rules, text, cwd);
      if (wrapperRule) break;
    }
    if (!wrapperRule || wrapperRule.state === "allow") {
      return {
        command: command.text,
        state: "allow",
        rule: wrapperRule,
        context: command.context,
        wrapperKind: command.wrapperKind,
      };
    }
  }

  // Get all text versions to try (stripped, normalized)
  const textsToTry = getMatchingTexts(command.text);

  // Try matching against all versions
  let matched: PatternRule | undefined;
  for (const text of textsToTry) {
    matched = matchRulesLastWins(rules, text, cwd);
    if (matched) break;
  }

  return {
    command: command.text,
    state: matched?.state ?? "allow",
    rule: matched,
    context: command.context,
    wrapperKind: command.wrapperKind,
  };
}

export function aggregateResults(
  results: EvaluationResult[],
  strategy: DecisionStrategy = "most-restrictive"
): EvaluationResult {
  if (results.length === 0) {
    return { command: "", state: "allow" };
  }

  switch (strategy) {
    case "most-restrictive":
      return pickMostRestrictive(results);
    case "last-match":
      return results[results.length - 1];
    case "first-match":
      return results[0];
    default:
      return pickMostRestrictive(results);
  }
}

function pickMostRestrictive(results: EvaluationResult[]): EvaluationResult {
  const deny = results.find(r => r.state === "deny");
  if (deny) return deny;

  return results[0];
}
