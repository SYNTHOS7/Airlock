import {
  type ActionRequest,
  type JevSignals,
  DispositionEnum,
  type Disposition,
  mergeDispositions,
  isStricterThan,
  mapJevSignalsToDisposition,
} from '@airlock/contracts';
import type {
  PolicyFacts,
  PolicyConfig,
  PolicyEvaluationResult,
  RuleResult,
} from './types.js';
import { DEFAULT_POLICY_CONFIG } from './config.js';
import { checkAuth } from './rules/auth.js';
import { checkInput } from './rules/input.js';
import { checkState } from './rules/state.js';
import { checkPayPalDispute } from './rules/dispute.js';
import { checkRemainingLimit, checkCumulativeCap } from './rules/limits.js';
import { checkVelocity } from './rules/velocity.js';
import { checkApprovalThreshold } from './rules/approval.js';
import { checkUncertainOutcome } from './rules/uncertain.js';

/**
 * Deterministic Policy Evaluation Engine (FR-6, FR-7).
 * 
 * Invariants:
 * 1. Pure function with zero I/O or network side effects.
 * 2. Deterministic: identical (request, facts, config) produces identical result.
 * 3. Monotonic Tighten-Only Rule:
 *    Final disposition = max(policyDisposition, jevDisposition)
 *    Disposition hierarchy: ALLOW < REQUIRE_APPROVAL < PAUSE_REVIEW < DENY
 *    Advisory models (Jev) can ONLY tighten an outcome, never loosen it.
 */
export function evaluate(
  request: ActionRequest,
  facts: PolicyFacts,
  config: PolicyConfig = DEFAULT_POLICY_CONFIG,
  jevSignals?: JevSignals
): PolicyEvaluationResult {
  const ruleResults: RuleResult[] = [
    checkAuth(facts),
    checkInput(request),
    checkPayPalDispute(facts),
    checkState(facts),
    checkRemainingLimit(request, facts),
    checkCumulativeCap(request, facts, config),
    checkVelocity(facts, config),
    checkApprovalThreshold(request, facts, config),
    checkUncertainOutcome(facts),
  ];

  const triggeredRules = ruleResults.filter((r) => r.triggered);
  const ruleIds = triggeredRules.map((r) => r.rule_id);
  const reasons = triggeredRules.map((r) => r.reason);

  // Strictest disposition among triggered deterministic rules wins
  let policyDisposition: Disposition = DispositionEnum.ALLOW;
  for (const rule of triggeredRules) {
    policyDisposition = mergeDispositions(policyDisposition, rule.disposition);
  }

  // If no rules triggered, reason reflects clean evaluation
  if (reasons.length === 0) {
    reasons.push('All deterministic policy checks passed.');
  }

  // Handle Jev advisory signals (Monotonic Merge)
  let jevDisposition: Disposition | undefined;
  let finalDisposition = policyDisposition;

  if (jevSignals) {
    jevDisposition = mapJevSignalsToDisposition(jevSignals);
    if (isStricterThan(jevDisposition, policyDisposition)) {
      finalDisposition = jevDisposition;
      ruleIds.push('JEV-001');
      reasons.push(
        `Jev advisory signal (${jevSignals.route}, injection=${jevSignals.injection_suspected}, ambiguity=${jevSignals.ambiguity}) escalated disposition to ${jevDisposition}.`
      );
    }
  }

  return {
    disposition: finalDisposition,
    ruleIds,
    reasons,
    policyDisposition,
    jevDisposition,
    jevSignals,
  };
}

