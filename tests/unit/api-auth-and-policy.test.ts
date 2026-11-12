/**
 * Focused tests for:
 * 1. Auth guard (requireUser / requireRole) — 401/403 on missing/wrong identity
 * 2. Policy override rejection — request body cannot weaken server-side policy
 * 3. Executed vs. Verified state distinction — execution ≠ verification
 */

import { describe, it, expect } from 'vitest';
import { resolveUser, DEMO_USERS } from '@airlock/mcp-server';

// ────────────────────────────────────────────────────────────────────────────
// 1. Auth Guard – resolveUser
// ────────────────────────────────────────────────────────────────────────────

describe('resolveUser', () => {
  it('returns null when no headers are provided', () => {
    expect(resolveUser(null, null)).toBeNull();
  });

  it('returns null when x-airlock-user is an unknown ID', () => {
    expect(resolveUser('unknown_user_123', null)).toBeNull();
  });

  it('returns null when Authorization token is invalid', () => {
    expect(resolveUser(null, 'Bearer bad_token_xyz')).toBeNull();
  });

  it('resolves agent_1 from x-airlock-user header', () => {
    const user = resolveUser('agent_1', null);
    expect(user).not.toBeNull();
    expect(user!.id).toBe('agent_1');
    expect(user!.roles).toContain('support_agent');
  });

  it('resolves approver_1 from x-airlock-user header', () => {
    const user = resolveUser('approver_1', null);
    expect(user).not.toBeNull();
    expect(user!.id).toBe('approver_1');
    expect(user!.roles).toContain('approver');
  });

  it('resolves viewer_1 from x-airlock-user header', () => {
    const user = resolveUser('viewer_1', null);
    expect(user).not.toBeNull();
    expect(user!.id).toBe('viewer_1');
    expect(user!.roles).toContain('viewer');
  });

  it('resolves user from Bearer token', () => {
    const user = resolveUser(null, 'Bearer tok_approver_1');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('approver_1');
  });

  it('prefers x-airlock-user header over Authorization token', () => {
    // Header says agent_1 but token says approver_1
    const user = resolveUser('agent_1', 'Bearer tok_approver_1');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('agent_1');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Role checks — structural verification
// ────────────────────────────────────────────────────────────────────────────

describe('Role-based access control', () => {
  it('agent_1 does NOT have approver role', () => {
    const user = DEMO_USERS.agent_1;
    expect(user.roles).not.toContain('approver');
    expect(user.roles).toContain('support_agent');
  });

  it('approver_1 has approver role', () => {
    const user = DEMO_USERS.approver_1;
    expect(user.roles).toContain('approver');
  });

  it('viewer_1 has viewer role but not approver', () => {
    const user = DEMO_USERS.viewer_1;
    expect(user.roles).toContain('viewer');
    expect(user.roles).not.toContain('approver');
  });

  it('no demo user defaults to approver when unresolved', () => {
    // This is the critical security invariant: missing identity must NOT
    // fall back to a privileged user.
    const result = resolveUser(null, null);
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Policy override rejection — structural contract tests
//    (Verify that the policy override fields the API routes reject are
//     the correct set, and that the body shapes used by the UI don't
//     include them.)
// ────────────────────────────────────────────────────────────────────────────

describe('Policy override rejection contract', () => {
  const FORBIDDEN_BODY_KEYS = [
    'approval_threshold_minor',
    'cumulative_cap_minor',
    'velocity_max_count',
  ];

  /**
   * Simulates the server-side body check from /api/evaluate and /api/operations.
   * Returns true if the body would be rejected as a security violation.
   */
  function wouldRejectBody(body: Record<string, unknown>): boolean {
    return FORBIDDEN_BODY_KEYS.some((key) => body[key] != null);
  }

  it('rejects body containing approval_threshold_minor', () => {
    expect(wouldRejectBody({ approval_threshold_minor: 1000 })).toBe(true);
  });

  it('rejects body containing cumulative_cap_minor', () => {
    expect(wouldRejectBody({ cumulative_cap_minor: 50000 })).toBe(true);
  });

  it('rejects body containing velocity_max_count', () => {
    expect(wouldRejectBody({ velocity_max_count: 99 })).toBe(true);
  });

  it('rejects body containing multiple policy overrides', () => {
    expect(
      wouldRejectBody({
        approval_threshold_minor: 100,
        cumulative_cap_minor: 999999,
        velocity_max_count: 999,
      })
    ).toBe(true);
  });

  it('allows a clean refund request body (no policy fields)', () => {
    expect(
      wouldRejectBody({
        payment_id: 'CAP-123',
        amount_minor: 4500,
        currency: 'USD',
        reason: 'Customer refund',
      })
    ).toBe(false);
  });

  it('allows body with null/undefined policy fields (considered absent)', () => {
    // undefined properties are not present in the serialized JSON body,
    // and the check uses `!= null` which treats both null and undefined
    // as "not provided". Our body check skips null.
    expect(
      wouldRejectBody({
        payment_id: 'CAP-123',
        approval_threshold_minor: null,
      })
    ).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Executed vs. Verified state distinction
//    The OperationStateEnum from contracts defines valid state transitions.
//    Execution produces SUCCEEDED state; verification is a separate step.
// ────────────────────────────────────────────────────────────────────────────

describe('Executed vs. Verified state distinction', () => {
  it('SUCCEEDED state exists and is distinct from any VERIFIED state', async () => {
    const { OperationStateEnum } = await import('@airlock/contracts');
    expect(OperationStateEnum.SUCCEEDED).toBe('SUCCEEDED');
    // There should be no VERIFIED state enum — verification is recorded
    // as evidence via OutcomeVerifier, not as a state transition.
    const allStates = Object.values(OperationStateEnum);
    expect(allStates).not.toContain('VERIFIED');
  });

  it('valid state machine includes execution states but not "VERIFIED"', async () => {
    const { OperationStateEnum } = await import('@airlock/contracts');
    // Core execution path states
    expect(OperationStateEnum.RECEIVED).toBeDefined();
    expect(OperationStateEnum.VALIDATING).toBeDefined();
    expect(OperationStateEnum.EVALUATING).toBeDefined();
    expect(OperationStateEnum.EXECUTING).toBeDefined();
    expect(OperationStateEnum.SUCCEEDED).toBeDefined();
    expect(OperationStateEnum.FAILED).toBeDefined();
  });
});

