import { DispositionEnum } from '@airlock/contracts';
import type { PolicyFacts, RuleResult } from '../types.js';

/**
 * PAYPAL-DISPUTE-001: PayPal Active Dispute & Chargeback Freeze
 * 
 * When a customer opens a dispute or chargeback directly on PayPal,
 * issuing an automated refund causes double monetary loss (refund + chargeback fine).
 * Airlock detects active disputes and immediately freezes automated processing,
 * routing to the PayPal Resolution Center.
 */
export function checkPayPalDispute(facts: PolicyFacts): RuleResult {
  const isDisputed =
    facts.payment_capture_status === 'DISPUTED' ||
    facts.payment_capture_status === 'CHARGEBACK' ||
    facts.payment_capture_status?.includes('DISPUTE');

  if (isDisputed) {
    return {
      triggered: true,
      rule_id: 'PAYPAL-DISPUTE-001',
      disposition: DispositionEnum.DENY,
      reason: 'Active PayPal dispute detected (CUSTOMER.DISPUTE.CREATED). Automated refund frozen to prevent merchant double-loss; routed to PayPal Resolution Center.',
    };
  }

  return {
    triggered: false,
    rule_id: 'PAYPAL-DISPUTE-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'No active PayPal dispute on record.',
  };
}
