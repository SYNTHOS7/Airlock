import { describe, it, expect, beforeEach } from 'vitest';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { PayPalSandboxAdapter, OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { createDatabase, AirlockRepository } from '@airlock/storage';
import {
  type ProviderAdapter,
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  ProviderRefundStatusEnum,
} from '@airlock/contracts';
import type Database from 'better-sqlite3';

const hasPayPalCreds = Boolean(
  process.env.PAYPAL_CLIENT_ID &&
  process.env.PAYPAL_CLIENT_SECRET &&
  process.env.PAYPAL_CLIENT_ID !== 'your_paypal_sandbox_client_id_here'
);

describe('Day 5: Provider Conformance Suite & Outcome Verification', () => {
  let db: Database.Database;
  let repo: AirlockRepository;
  let mockAdapter: MockProviderAdapter;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    repo = new AirlockRepository(db);
    mockAdapter = new MockProviderAdapter('success');
    mockAdapter.seedCapture('CAP-CONF-100', createMoney(100.0, 'USD'));
  });

  const providers: Array<{ name: string; getAdapter: () => ProviderAdapter; isAvailable: boolean }> = [
    {
      name: 'Deterministic Mock Provider',
      getAdapter: () => mockAdapter,
      isAvailable: true,
    },
    {
      name: 'Live PayPal Sandbox',
      getAdapter: () => new PayPalSandboxAdapter(),
      isAvailable: hasPayPalCreds,
    },
  ];

  for (const { name, getAdapter, isAvailable } of providers) {
    describe(`Conformance: ${name}`, () => {
      it.skipIf(!isAvailable)('executes a baseline refund and returns COMPLETED', async () => {
        const adapter = getAdapter();
        const result = await adapter.refund({
          operation_id: 'op_conf_01',
          provider_idempotency_key: `idemp_${Date.now()}_01`,
          capture_id: name.includes('Mock') ? 'CAP-CONF-100' : (process.env.TEST_CAPTURE_ID || 'CAP-CONF-100'),
          amount: createMoney(20.0, 'USD'),
          reason: 'Conformance baseline test',
        });

        expect(result.status).toBe(ProviderRefundStatusEnum.COMPLETED);
        expect(result.custom_id).toBe('op_conf_01');
        expect(result.amount.amount_minor).toBe(2000);
      });

      it.skipIf(!isAvailable)('Spike Exp 3: Replaying same idempotency key twice does not double-refund', async () => {
        const adapter = getAdapter();
        const key = `idemp_replay_${Date.now()}`;
        const cmd = {
          operation_id: 'op_conf_replay',
          provider_idempotency_key: key,
          capture_id: name.includes('Mock') ? 'CAP-CONF-100' : (process.env.TEST_CAPTURE_ID || 'CAP-CONF-100'),
          amount: createMoney(15.0, 'USD'),
        };

        const res1 = await adapter.refund(cmd);
        const res2 = await adapter.refund(cmd);

        expect(res1.provider_refund_id).toBe(res2.provider_refund_id);
        expect(res1.amount.amount_minor).toBe(res2.amount.amount_minor);
      });

      it.skipIf(!isAvailable)('lookups known refund by provider refund ID', async () => {
        const adapter = getAdapter();
        const res = await adapter.refund({
          operation_id: 'op_conf_lookup',
          provider_idempotency_key: `idemp_lookup_${Date.now()}`,
          capture_id: name.includes('Mock') ? 'CAP-CONF-100' : (process.env.TEST_CAPTURE_ID || 'CAP-CONF-100'),
          amount: createMoney(10.0, 'USD'),
        });

        const lookup = await adapter.getRefund(res.provider_refund_id);
        expect(lookup.provider_refund_id).toBe(res.provider_refund_id);
        expect(lookup.status).toBe(ProviderRefundStatusEnum.COMPLETED);
      });

      it.skipIf(!isAvailable)('Spike Exp 7: Over-refund error when amount exceeds remaining balance', async () => {
        const adapter = getAdapter();
        await expect(
          adapter.refund({
            operation_id: 'op_conf_over',
            provider_idempotency_key: `idemp_over_${Date.now()}`,
            capture_id: name.includes('Mock') ? 'CAP-CONF-100' : (process.env.TEST_CAPTURE_ID || 'CAP-CONF-100'),
            amount: createMoney(999.0, 'USD'), // Exceeds balance
          })
        ).rejects.toThrow();
      });
    });
  }

  describe('Outcome Verifier (Lost Response Recovery & MISMATCH-001)', () => {
    it('verifies known refund ID and transitions operation to SUCCEEDED', async () => {
      const verifier = new OutcomeVerifier(repo, mockAdapter);

      const fp = computeParamsFingerprint({ action_type: 'REFUND', payment_id: 'CAP-CONF-100', reason: 'test' });
      const { operation } = repo.createOrGetOperation({
        request_id: 'req_v_01',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-CONF-100',
        amount: createMoney(25.0, 'USD'),
        reason: 'test',
        requester_id: 'agent_1',
      });

      // Execute on mock
      const refund = await mockAdapter.refund({
        operation_id: operation.operation_id,
        provider_idempotency_key: operation.provider_idempotency_key,
        capture_id: 'CAP-CONF-100',
        amount: createMoney(25.0, 'USD'),
      });

      // Update operation with provider ID
      repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

      // Verify
      const vResult = await verifier.verifyOperation(operation.operation_id);
      expect(vResult.outcome).toBe('VERIFIED_SUCCESS');
      expect(vResult.mismatch_flags).toHaveLength(0);

      const opFinal = repo.getOperation(operation.operation_id)!;
      expect(opFinal.state).toBe(OperationStateEnum.SUCCEEDED);
    });

    it('reconciles LOST RESPONSE: resolves OUTCOME_UNKNOWN via same-key replay without duplicate execution', async () => {
      // Simulate lost response on adapter
      mockAdapter.setMode('timeout_but_executed');
      const verifier = new OutcomeVerifier(repo, mockAdapter);

      const fp = computeParamsFingerprint({ action_type: 'REFUND', payment_id: 'CAP-CONF-100', reason: 'lost response' });
      const { operation } = repo.createOrGetOperation({
        request_id: 'req_lost_01',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-CONF-100',
        amount: createMoney(30.0, 'USD'),
        reason: 'lost response',
        requester_id: 'agent_1',
      });

      repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

      // Call refund mid-call -> throws lost response error
      await expect(
        mockAdapter.refund({
          operation_id: operation.operation_id,
          provider_idempotency_key: operation.provider_idempotency_key,
          capture_id: 'CAP-CONF-100',
          amount: createMoney(30.0, 'USD'),
        })
      ).rejects.toThrow();

      // Operation marked OUTCOME_UNKNOWN
      repo.transitionOperation(operation.operation_id, OperationStateEnum.OUTCOME_UNKNOWN, 'Lost response simulation');

      // Now switch adapter to normal success to allow replay verification
      mockAdapter.setMode('success');

      // Verifier runs active reconciliation
      const vResult = await verifier.verifyOperation(operation.operation_id);

      expect(vResult.outcome).toBe('VERIFIED_SUCCESS');
      expect(vResult.reason).toContain('same-key replay');

      const opRecovered = repo.getOperation(operation.operation_id)!;
      expect(opRecovered.state).toBe(OperationStateEnum.SUCCEEDED);
      expect(opRecovered.provider_operation_id).toBeDefined();

      // Capture balance only deducted once ($30.00)
      const capture = await mockAdapter.getCapture('CAP-CONF-100');
      expect(capture.refunded_amount.amount_minor).toBe(3000);
    });

    it('MISMATCH-001: Flags discrepancy when provider amount differs from request and escalates to NEEDS_REVIEW', async () => {
      const verifier = new OutcomeVerifier(repo, mockAdapter);

      const fp = computeParamsFingerprint({ action_type: 'REFUND', payment_id: 'CAP-CONF-100', reason: 'mismatch' });
      const { operation } = repo.createOrGetOperation({
        request_id: 'req_mis_01',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-CONF-100',
        amount: createMoney(50.0, 'USD'), // Operation requested $50.00
        reason: 'mismatch test',
        requester_id: 'agent_1',
      });

      // Provider executed a different amount ($20.00)
      const refund = await mockAdapter.refund({
        operation_id: operation.operation_id,
        provider_idempotency_key: operation.provider_idempotency_key,
        capture_id: 'CAP-CONF-100',
        amount: createMoney(20.0, 'USD'), // Discrepancy!
      });

      repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING, undefined, refund.provider_refund_id);

      // Verify
      const vResult = await verifier.verifyOperation(operation.operation_id);

      expect(vResult.outcome).toBe('UNRESOLVED');
      expect(vResult.mismatch_flags).toContain('AMOUNT_MISMATCH');

      const opFinal = repo.getOperation(operation.operation_id)!;
      expect(opFinal.state).toBe(OperationStateEnum.NEEDS_REVIEW);
    });
  });
});

