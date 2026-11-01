import { DispositionEnum, OperationStateEnum } from '@airlock/contracts';
import type { PolicyFacts, RuleResult } from '../types.js';

/**
 * UNCERTAIN-001: Ambiguous or In-Flight Outcome Check
 * If a prior attempt for this operation or payment timed out, remains OUTCOME_UNKNOWN,
 * or is PENDING, we must verify first before any retry. Blind retry is forbidden.
 */
export function checkUncertainOutcome(facts: PolicyFacts): RuleResult {
  if (
    facts.prior_attempt_state === OperationStateEnum.OUTCOME_UNKNOWN ||
    facts.prior_attempt_state === 'PENDING'
  ) {
    return {
      triggered: true,
      rule_id: 'UNCERTAIN-001',
      disposition: DispositionEnum.PAUSE_REVIEW,
      reason: `Prior attempt for this payment is in '${facts.prior_attempt_state}' state. Blind retry forbidden; must verify existing operation first.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'UNCERTAIN-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'No ambiguous in-flight operations detected.',
  };
}

