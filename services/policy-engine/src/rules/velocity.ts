import { DispositionEnum } from '@airlock/contracts';
import type { PolicyFacts, PolicyConfig, RuleResult } from '../types.js';

/**
 * VELOCITY-001: Caller Velocity Limit
 * When a caller initiates N or more refunds within the rolling time window,
 * subsequent requests require human approval.
 */
export function checkVelocity(facts: PolicyFacts, config: PolicyConfig): RuleResult {
  if (facts.caller_recent_refunds_count >= config.velocity_max_count) {
    return {
      triggered: true,
      rule_id: 'VELOCITY-001',
      disposition: DispositionEnum.REQUIRE_APPROVAL,
      reason: `Caller '${facts.caller_id}' initiated ${facts.caller_recent_refunds_count} refunds within the last ${config.velocity_window_seconds / 3600}h (limit: ${config.velocity_max_count}). Escalated to approval.`,
    };
  }

  return {
    triggered: false,
    rule_id: 'VELOCITY-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Caller velocity is within normal threshold.',
  };
}

