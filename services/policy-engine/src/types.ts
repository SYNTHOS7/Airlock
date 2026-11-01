import {
  type Disposition,
  type Money,
  type OperationState,
  type JevSignals,
} from '@airlock/contracts';

export type CallerRole = 'support_agent' | 'approver' | 'viewer';

export interface PolicyFacts {
  caller_id: string;
  caller_roles: CallerRole[];
  payment_capture_status: string;
  remaining_refundable_amount: Money;
  completed_refunds_total: Money;
  inflight_refunds_total: Money;
  caller_recent_refunds_count: number;
  prior_attempt_state?: OperationState | 'PENDING' | null;
}

export interface PolicyConfig {
  approval_threshold_minor: number; // e.g. 5000 = $50.00
  cumulative_cap_minor: number; // e.g. 20000 = $200.00
  velocity_max_count: number; // e.g. 5
  velocity_window_seconds: number; // e.g. 3600
}

export interface RuleResult {
  triggered: boolean;
  rule_id: string;
  disposition: Disposition;
  reason: string;
}

export interface PolicyEvaluationResult {
  disposition: Disposition;
  ruleIds: string[];
  reasons: string[];
  policyDisposition: Disposition;
  jevDisposition?: Disposition;
  jevSignals?: JevSignals;
}
