export type PermissionState = "allow" | "deny";
export type DecisionStrategy = "most-restrictive" | "last-match" | "first-match";

export interface PatternRule {
  regex?: string;
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
  /** Rules that cannot be overridden by ordinary allow rules. */
  hard_deny?: PatternRule[];
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
