import {
  DispositionEnum,
  type ActionRequest,
  formatMoney,
  fromMinor,
} from '@airlock/contracts';
import type { PolicyFacts, PolicyConfig, RuleResult } from '../types.js';

/**
 * LIMIT-001: Remaining Refundable Amount Check
 * Requested amount cannot exceed the verified remaining refundable amount on the capture.
 */
export function checkRemainingLimit(request: ActionRequest, facts: PolicyFacts): RuleResult {
  const requestedMinor = request.amount?.amount_minor ?? facts.remaining_refundable_amount.amount_minor;

  if (requestedMinor > facts.remaining_refundable_amount.amount_minor) {
    const requestedMoney = fromMinor(requestedMinor, facts.remaining_refundable_amount.currency);
    return {
      triggered: true,
      rule_id: 'LIMIT-001',
      disposition: DispositionEnum.DENY,
      reason: `Requested refund (${formatMoney(requestedMoney)}) exceeds verified remaining refundable balance (${formatMoney(facts.remaining_refundable_amount)}).`,
    };
  }

  return {
    triggered: false,
    rule_id: 'LIMIT-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Requested amount is within remaining capture balance.',
  };
}

/**
 * LIMIT-002: Cumulative Refund Cap Check (Split-Refund Protection)
 * Total of completed refunds + in-flight refunds + current request cannot exceed the configured cap.
 */
export function checkCumulativeCap(
  request: ActionRequest,
  facts: PolicyFacts,
  config: PolicyConfig
): RuleResult {
  const requestedMinor = request.amount?.amount_minor ?? facts.remaining_refundable_amount.amount_minor;
  const totalCumulativeMinor =
    facts.completed_refunds_total.amount_minor +
    facts.inflight_refunds_total.amount_minor +
    requestedMinor;

  if (totalCumulativeMinor > config.cumulative_cap_minor) {
    const totalMoney = fromMinor(totalCumulativeMinor, facts.remaining_refundable_amount.currency);
    const capMoney = fromMinor(config.cumulative_cap_minor, facts.remaining_refundable_amount.currency);

    return {
      triggered: true,
      rule_id: 'LIMIT-002',
      disposition: DispositionEnum.DENY,
      reason: `Cumulative refunds (${formatMoney(totalMoney)}) would exceed the payment cumulative cap of ${formatMoney(capMoney)}.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'LIMIT-002',
    disposition: DispositionEnum.ALLOW,
    reason: 'Cumulative refunds are within limits.',
  };
}

