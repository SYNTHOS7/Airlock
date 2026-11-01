import { describe, it, expect } from 'vitest';
import { evaluate } from '../engine.js';
import { createPolicyConfig } from '../config.js';
import type { PolicyFacts } from '../types.js';
import {
  createMoney,
  DispositionEnum,
  type ActionRequest,
  type JevSignals,
  OperationStateEnum,
} from '@airlock/contracts';

describe('Deterministic Policy Engine: Rules, Boundaries & Monotonic Merge', () => {
  const config = createPolicyConfig({
    approval_threshold_minor: 5000, // $50.00 USD
    cumulative_cap_minor: 20000, // $200.00 USD
    velocity_max_count: 5,
    velocity_window_seconds: 3600,
  });

  const baseRequest: ActionRequest = {
    request_id: 'req_pe_01',
    action_type: 'REFUND',
    payment_id: 'CAP-100',
    amount: createMoney(25.0, 'USD'),
    reason: 'Standard customer return',
    requester_id: 'agent_alice',
  };

  const baseFacts: PolicyFacts = {
    caller_id: 'agent_alice',
    caller_roles: ['support_agent'],
    payment_capture_status: 'COMPLETED',
    remaining_refundable_amount: createMoney(100.0, 'USD'),
    completed_refunds_total: createMoney(0, 'USD'),
    inflight_refunds_total: createMoney(0, 'USD'),
    caller_recent_refunds_count: 0,
    prior_attempt_state: null,
  };

  describe('Happy Path', () => {
    it('returns ALLOW when all policy conditions pass under threshold', () => {
      const res = evaluate(baseRequest, baseFacts, config);
      expect(res.disposition).toBe(DispositionEnum.ALLOW);
      expect(res.ruleIds).toHaveLength(0);
    });
  });

  describe('Rule Boundary Tests (Hits and Near-Misses)', () => {
    // AUTH-001
    it('AUTH-001: Denies if caller lacks support_agent role; allows if role is present', () => {
      const denied = evaluate(baseRequest, { ...baseFacts, caller_roles: ['viewer'] }, config);
      expect(denied.disposition).toBe(DispositionEnum.DENY);
      expect(denied.ruleIds).toContain('AUTH-001');

      const allowed = evaluate(baseRequest, { ...baseFacts, caller_roles: ['support_agent'] }, config);
      expect(allowed.disposition).toBe(DispositionEnum.ALLOW);
    });

    // INPUT-001
    it('INPUT-001: Denies if refund amount is zero or negative', () => {
      const zeroReq = { ...baseRequest, amount: createMoney(0, 'USD') };
      const res = evaluate(zeroReq, baseFacts, config);
      expect(res.disposition).toBe(DispositionEnum.DENY);
      expect(res.ruleIds).toContain('INPUT-001');
    });

    // STATE-001
    it('STATE-001: Denies if capture is DECLINED or VOIDED; allows if PARTIALLY_REFUNDED', () => {
      const denied = evaluate(baseRequest, { ...baseFacts, payment_capture_status: 'DECLINED' }, config);
      expect(denied.disposition).toBe(DispositionEnum.DENY);
      expect(denied.ruleIds).toContain('STATE-001');

      const allowed = evaluate(baseRequest, { ...baseFacts, payment_capture_status: 'PARTIALLY_REFUNDED' }, config);
      expect(allowed.disposition).toBe(DispositionEnum.ALLOW);
    });

    // LIMIT-001 (Remaining refundable balance boundary)
    it('LIMIT-001: Denies if request exceeds remaining balance; allows at exact boundary', () => {
      // Near-miss: exactly $100.00 against $100.00 remaining -> within limits (triggers approval because > $50)
      const exactReq = { ...baseRequest, amount: createMoney(100.0, 'USD') };
      const exactRes = evaluate(exactReq, baseFacts, config);
      expect(exactRes.ruleIds).not.toContain('LIMIT-001');

      // Hit: $100.01 against $100.00 remaining -> DENY
      const overReq = { ...baseRequest, amount: createMoney(100.01, 'USD') };
      const overRes = evaluate(overReq, baseFacts, config);
      expect(overRes.disposition).toBe(DispositionEnum.DENY);
      expect(overRes.ruleIds).toContain('LIMIT-001');
    });

    // APPROVAL-001 (Auto-approval threshold: $50.00)
    it('APPROVAL-001: Auto-allows at exact boundary $50.00; requires approval at $50.01', () => {
      // Near-miss: exactly $50.00
      const boundaryReq = { ...baseRequest, amount: createMoney(50.0, 'USD') };
      const boundaryRes = evaluate(boundaryReq, baseFacts, config);
      expect(boundaryRes.disposition).toBe(DispositionEnum.ALLOW);
      expect(boundaryRes.ruleIds).not.toContain('APPROVAL-001');

      // Hit: $50.01
      const aboveReq = { ...baseRequest, amount: createMoney(50.01, 'USD') };
      const aboveRes = evaluate(aboveReq, baseFacts, config);
      expect(aboveRes.disposition).toBe(DispositionEnum.REQUIRE_APPROVAL);
      expect(aboveRes.ruleIds).toContain('APPROVAL-001');
    });

    // VELOCITY-001 (Limit: 5 refunds in window)
    it('VELOCITY-001: Auto-allows at count=4; requires approval at count=5', () => {
      // Near-miss: 4 previous refunds
      const res4 = evaluate(baseRequest, { ...baseFacts, caller_recent_refunds_count: 4 }, config);
      expect(res4.disposition).toBe(DispositionEnum.ALLOW);

      // Hit: 5 previous refunds
      const res5 = evaluate(baseRequest, { ...baseFacts, caller_recent_refunds_count: 5 }, config);
      expect(res5.disposition).toBe(DispositionEnum.REQUIRE_APPROVAL);
      expect(res5.ruleIds).toContain('VELOCITY-001');
    });

    // UNCERTAIN-001 (Ambiguous prior outcome)
    it('UNCERTAIN-001: Pauses for review if prior attempt is OUTCOME_UNKNOWN', () => {
      const res = evaluate(
        baseRequest,
        { ...baseFacts, prior_attempt_state: OperationStateEnum.OUTCOME_UNKNOWN },
        config
      );
      expect(res.disposition).toBe(DispositionEnum.PAUSE_REVIEW);
      expect(res.ruleIds).toContain('UNCERTAIN-001');
    });
  });

  describe('Crucial Split-Refund Test (Day 2 Block 5)', () => {
    it('blocks the 5th small refund when sum exceeds cumulative cap, even though each is under approval threshold', () => {
      // Each refund is $45.00 (under the $50.00 approval threshold)
      const splitAmount = createMoney(45.0, 'USD');
      const splitReq: ActionRequest = { ...baseRequest, amount: splitAmount };

      // Total capture is large ($300.00)
      const captureBalance = createMoney(300.0, 'USD');

      // Refund 1: $45 total (cap $200) -> ALLOW
      const facts1: PolicyFacts = {
        ...baseFacts,
        remaining_refundable_amount: captureBalance,
        completed_refunds_total: createMoney(0, 'USD'),
      };
      expect(evaluate(splitReq, facts1, config).disposition).toBe(DispositionEnum.ALLOW);

      // Refund 2: $45 completed, + $45 = $90 total -> ALLOW
      const facts2: PolicyFacts = {
        ...baseFacts,
        remaining_refundable_amount: captureBalance,
        completed_refunds_total: createMoney(45.0, 'USD'),
      };
      expect(evaluate(splitReq, facts2, config).disposition).toBe(DispositionEnum.ALLOW);

      // Refund 3: $90 completed, + $45 = $135 total -> ALLOW
      const facts3: PolicyFacts = {
        ...baseFacts,
        remaining_refundable_amount: captureBalance,
        completed_refunds_total: createMoney(90.0, 'USD'),
      };
      expect(evaluate(splitReq, facts3, config).disposition).toBe(DispositionEnum.ALLOW);

      // Refund 4: $135 completed, + $45 = $180 total -> ALLOW
      const facts4: PolicyFacts = {
        ...baseFacts,
        remaining_refundable_amount: captureBalance,
        completed_refunds_total: createMoney(135.0, 'USD'),
      };
      expect(evaluate(splitReq, facts4, config).disposition).toBe(DispositionEnum.ALLOW);

      // Refund 5: $180 completed, + $45 = $225 total (> $200.00 CAP)
      // MUST NOT be auto-allowed! Must trigger LIMIT-002!
      const facts5: PolicyFacts = {
        ...baseFacts,
        remaining_refundable_amount: captureBalance,
        completed_refunds_total: createMoney(180.0, 'USD'),
      };
      const res5 = evaluate(splitReq, facts5, config);
      expect(res5.disposition).toBe(DispositionEnum.DENY);
      expect(res5.ruleIds).toContain('LIMIT-002');
    });
  });

  describe('Advisory Model Monotonic Merge (Jev)', () => {
    it('advisory model CANNOT loosen an authoritative policy denial', () => {
      // Unauthorized caller
      const unauthorizedFacts = { ...baseFacts, caller_roles: ['viewer'] as any };
      // Jev says "proceed"
      const jevProceed: JevSignals = {
        intent_match: 'yes',
        injection_suspected: false,
        ambiguity: 'low',
        route: 'proceed',
      };

      const res = evaluate(baseRequest, unauthorizedFacts, config, jevProceed);
      expect(res.policyDisposition).toBe(DispositionEnum.DENY);
      expect(res.disposition).toBe(DispositionEnum.DENY); // Policy DENY stays DENY!
    });

    it('advisory model tightens clean ALLOW to PAUSE_REVIEW when prompt injection is detected', () => {
      const jevInjection: JevSignals = {
        intent_match: 'yes',
        injection_suspected: true, // Prompt injection flagged!
        ambiguity: 'low',
        route: 'proceed',
      };

      const res = evaluate(baseRequest, baseFacts, config, jevInjection);
      expect(res.policyDisposition).toBe(DispositionEnum.ALLOW);
      expect(res.disposition).toBe(DispositionEnum.PAUSE_REVIEW); // Tightened!
      expect(res.ruleIds).toContain('JEV-001');
    });
  });
});

