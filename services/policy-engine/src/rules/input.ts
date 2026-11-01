import { DispositionEnum, type ActionRequest } from '@airlock/contracts';
import type { RuleResult } from '../types.js';

/**
 * INPUT-001: Amount & Currency Validation
 * Refunds must have a valid positive minor unit amount and valid 3-letter currency code.
 */
export function checkInput(request: ActionRequest): RuleResult {
  if (request.amount) {
    if (request.amount.amount_minor <= 0) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: 'Refund amount must be strictly greater than zero.',
      };
    }

    if (!/^[A-Z]{3}$/.test(request.amount.currency)) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: `Invalid currency code '${request.amount.currency}'. Must be 3 uppercase letters (ISO 4217).`,
      };
    }
  }

  return {
    triggered: false,
    rule_id: 'INPUT-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Request input parameters are valid.',
  };
}

