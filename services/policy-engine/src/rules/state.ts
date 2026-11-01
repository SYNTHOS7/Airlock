import { DispositionEnum } from '@airlock/contracts';
import type { PolicyFacts, RuleResult } from '../types.js';

/**
 * STATE-001: Target Payment State Check
 * Payment must be in a refundable state ('COMPLETED' or 'PARTIALLY_REFUNDED').
 */
export function checkState(facts: PolicyFacts): RuleResult {
  const allowedStates = ['COMPLETED', 'PARTIALLY_REFUNDED'];
  const isRefundable = allowedStates.includes(facts.payment_capture_status);

  if (!isRefundable) {
    return {
      triggered: true,
      rule_id: 'STATE-001',
      disposition: DispositionEnum.DENY,
      reason: `Payment capture is in '${facts.payment_capture_status}' state; only COMPLETED or PARTIALLY_REFUNDED payments can be refunded.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'STATE-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Payment is in a refundable state.',
  };
}

