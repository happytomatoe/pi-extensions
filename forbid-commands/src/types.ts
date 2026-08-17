export type PermissionState = "allow" | "deny";
export type DecisionStrategy = "most-restrictive" | "last-match" | "first-match";

/**
 * Structured command representation for pattern matching
 */
export interface CommandPattern {
  command: string;        // e.g., "git", "rm", "kill"
  subcommand?: string;    // e.g., "push", "commit"
  flags: string[];        // e.g., ["--no-verify", "-f"]
  flagArgs: string[];     // args after flags
  raw: string;            // original command string
}

export interface PatternRule {
  regex?: string;
  pattern?: string;
  message?: string;
  state: PermissionState;
  parsed?: CommandPattern;  // structured representation of pattern
  pattern?: string;
  message?: string;
  state: PermissionState;
}

export interface BlockPrCreateForForkUpstreamConfig {
  enabled: boolean;
  exempt_repos?: string[];
}

export interface Config {
  use_dcg?: boolean;
  decision_strategy?: DecisionStrategy;
  deny: PatternRule[];
  allow: PatternRule[];
  block_pr_create_for_fork_upstream?: BlockPrCreateForForkUpstreamConfig;
}

export interface EvaluationResult {
  command: string;
  state: PermissionState;
  rule?: PatternRule;
  context?: string;
  wrapperKind?: string;
}
