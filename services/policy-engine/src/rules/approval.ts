import {
  DispositionEnum,
  type ActionRequest,
  formatMoney,
  fromMinor,
} from '@airlock/contracts';
import type { PolicyFacts, PolicyConfig, RuleResult } from '../types.js';

/**
 * APPROVAL-001: Monetary Threshold for Consequential Actions
 * Refunds strictly greater than the threshold require human approval.
 */
export function checkApprovalThreshold(
  request: ActionRequest,
  facts: PolicyFacts,
  config: PolicyConfig
): RuleResult {
  const requestedMinor = request.amount?.amount_minor ?? facts.remaining_refundable_amount.amount_minor;

  if (requestedMinor > config.approval_threshold_minor) {
    const requestedMoney = fromMinor(requestedMinor, facts.remaining_refundable_amount.currency);
    const thresholdMoney = fromMinor(config.approval_threshold_minor, facts.remaining_refundable_amount.currency);

    return {
      triggered: true,
      rule_id: 'APPROVAL-001',
      disposition: DispositionEnum.REQUIRE_APPROVAL,
      reason: `Refund amount ${formatMoney(requestedMoney)} exceeds auto-approval threshold of ${formatMoney(thresholdMoney)}. Requires human approval.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'APPROVAL-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Refund amount is within auto-approval threshold.',
  };
}

