import type { PolicyConfig } from './types.js';

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  // Consequential threshold: actions > $50.00 require human approval
  approval_threshold_minor: 5000,
  // Per-payment cap across all completed and in-flight refunds: $200.00
  cumulative_cap_minor: 20000,
  // Velocity limit: max 5 refunds per caller in a 1-hour window
  velocity_max_count: 5,
  velocity_window_seconds: 3600,
};

export function createPolicyConfig(overrides?: Partial<PolicyConfig>): PolicyConfig {
  return {
    ...DEFAULT_POLICY_CONFIG,
    ...overrides,
  };
}

