import { DispositionEnum } from '@airlock/contracts';
import type { PolicyFacts, RuleResult } from '../types.js';

/**
 * AUTH-001: Caller Authorization Check
 * Caller must have the 'support_agent' role to request payment operations.
 */
export function checkAuth(facts: PolicyFacts): RuleResult {
  const isAuthorized = facts.caller_roles.includes('support_agent');

  if (!isAuthorized) {
    return {
      triggered: true,
      rule_id: 'AUTH-001',
      disposition: DispositionEnum.DENY,
      reason: `Caller '${facts.caller_id}' lacks required 'support_agent' role.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'AUTH-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Caller holds required role.',
  };
}

