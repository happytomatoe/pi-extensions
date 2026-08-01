export type PermissionState = "allow" | "ask" | "deny";
export type DecisionStrategy = "most-restrictive" | "last-match" | "first-match";

export interface PatternRule {
  regex?: string;
  pattern?: string;
  message?: string;
  state: PermissionState;
}

export interface Config {
  use_dcg?: boolean;
  decision_strategy?: DecisionStrategy;
  deny: PatternRule[];
  confirm: PatternRule[];
  allow: PatternRule[];
}

export interface EvaluationResult {
  command: string;
  state: PermissionState;
  rule?: PatternRule;
  context?: string;
  wrapperKind?: string;
}
