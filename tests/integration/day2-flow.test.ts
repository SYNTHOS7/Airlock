import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, AirlockRepository, reconcileStartupOperations, IdempotencyConflictError } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { evaluate, loadPolicyFacts, createPolicyConfig } from '@airlock/policy-engine';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  DispositionEnum,
  type ActionRequest,
  ProviderRefundStatusEnum,
} from '@airlock/contracts';
import type Database from 'better-sqlite3';

describe('Day 2 Integration Flow: Storage, Mock Adapter, Policy Engine', () => {
  let db: Database.Database;
  let repo: AirlockRepository;
  let adapter: MockProviderAdapter;
  const config = createPolicyConfig({
    approval_threshold_minor: 5000, // $50.00
    cumulative_cap_minor: 20000, // $200.00
    velocity_max_count: 5,
    velocity_window_seconds: 3600,
  });

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    repo = new AirlockRepository(db);
    adapter = new MockProviderAdapter('success');
    adapter.seedCapture('CAP-E2E-250', createMoney(250.0, 'USD'));
  });

  it('End-to-End Happy Path: Intake -> Evaluate -> Guarded Transitions -> Execute -> Audit', async () => {
    const request: ActionRequest = {
      request_id: 'req_e2e_01',
      action_type: 'REFUND',
      payment_id: 'CAP-E2E-250',
      amount: createMoney(40.0, 'USD'), // Under $50 threshold -> auto-approved
      reason: 'Standard return requested',
      requester_id: 'agent_bob',
    };

    // 1. Intake Operation
    const fp = computeParamsFingerprint(request);
    const { operation, isNew } = repo.createOrGetOperation({
      ...request,
      params_fingerprint: fp,
      provider: 'mock',
    });
    expect(isNew).toBe(true);
    expect(operation.state).toBe(OperationStateEnum.RECEIVED);

    // 2. Validate
    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);

    // 3. Evaluate Policy with Facts Loader
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    const facts = await loadPolicyFacts({
      caller_id: request.requester_id,
      payment_id: request.payment_id,
      repository: repo,
      adapter,
      config,
    });

    const evalResult = evaluate(request, facts, config);
    expect(evalResult.disposition).toBe(DispositionEnum.ALLOW);

    repo.recordDecision({
      operation_id: operation.operation_id,
      jev_status: 'ran',
      policy_result: evalResult.policyDisposition,
      policy_rule_ids: evalResult.ruleIds,
      policy_reason: evalResult.reasons.join('; '),
      final_disposition: evalResult.disposition,
    });

    // 4. Move to READY
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);

    // 5. Write-Ahead Record: Persist as EXECUTING before calling provider
    const executingOp = repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
    expect(executingOp.provider_idempotency_key).toBeDefined();

    // 6. Execute Provider Action
    const refundResult = await adapter.refund({
      operation_id: operation.operation_id,
      provider_idempotency_key: executingOp.provider_idempotency_key,
      capture_id: request.payment_id,
      amount: request.amount,
      reason: request.reason,
    });
    expect(refundResult.status).toBe(ProviderRefundStatusEnum.COMPLETED);

    // 7. Record Evidence & Complete Transition
    repo.recordEvidence({
      operation_id: operation.operation_id,
      evidence_type: 'provider_response',
      provider_reference: refundResult.provider_refund_id,
      observed_status: refundResult.status,
      outcome: 'VERIFIED_SUCCESS',
      data: refundResult.raw_response,
    });

    const finalOp = repo.transitionOperation(
      operation.operation_id,
      OperationStateEnum.SUCCEEDED,
      'Provider verified refund completed',
      refundResult.provider_refund_id
    );

    expect(finalOp.state).toBe(OperationStateEnum.SUCCEEDED);
    expect(finalOp.provider_operation_id).toBe(refundResult.provider_refund_id);

    // Provider capture state was updated
    const captureAfter = await adapter.getCapture('CAP-E2E-250');
    expect(captureAfter.refunded_amount.amount_minor).toBe(4000);
    expect(captureAfter.remaining_refundable_amount.amount_minor).toBe(21000);
  });

  it('Idempotent Replay (IDEMP-001): Returns existing completed operation without re-executing on provider', async () => {
    const request: ActionRequest = {
      request_id: 'req_replay_01',
      action_type: 'REFUND',
      payment_id: 'CAP-E2E-250',
      amount: createMoney(30.0, 'USD'),
      reason: 'Replay test',
      requester_id: 'agent_bob',
    };

    const fp = computeParamsFingerprint(request);
    const { operation } = repo.createOrGetOperation({
      ...request,
      params_fingerprint: fp,
      provider: 'mock',
    });

    // Complete the operation
    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
    await adapter.refund({
      operation_id: operation.operation_id,
      provider_idempotency_key: operation.provider_idempotency_key,
      capture_id: request.payment_id,
      amount: request.amount,
    });
    repo.transitionOperation(operation.operation_id, OperationStateEnum.SUCCEEDED);

    const captureBefore = await adapter.getCapture('CAP-E2E-250');
    expect(captureBefore.refunded_amount.amount_minor).toBe(3000);

    // Replay with identical request
    const replayResult = repo.createOrGetOperation({
      ...request,
      params_fingerprint: fp,
      provider: 'mock',
    });

    expect(replayResult.isNew).toBe(false);
    expect(replayResult.operation.state).toBe(OperationStateEnum.SUCCEEDED);
    expect(replayResult.operation.operation_id).toBe(operation.operation_id);

    // Provider capture balance remains identical (no double refund)
    const captureAfter = await adapter.getCapture('CAP-E2E-250');
    expect(captureAfter.refunded_amount.amount_minor).toBe(3000);
  });

  it('Parameter Tampering (IDEMP-002): Reusing request_id with different amount throws IdempotencyConflictError', () => {
    const request: ActionRequest = {
      request_id: 'req_tamper_01',
      action_type: 'REFUND',
      payment_id: 'CAP-E2E-250',
      amount: createMoney(30.0, 'USD'),
      reason: 'Original request',
      requester_id: 'agent_bob',
    };

    const fp1 = computeParamsFingerprint(request);
    repo.createOrGetOperation({
      ...request,
      params_fingerprint: fp1,
      provider: 'mock',
    });

    // Replay same request_id with altered amount
    const alteredRequest = { ...request, amount: createMoney(50.0, 'USD') };
    const fp2 = computeParamsFingerprint(alteredRequest);

    expect(() =>
      repo.createOrGetOperation({
        ...alteredRequest,
        params_fingerprint: fp2,
        provider: 'mock',
      })
    ).toThrow(IdempotencyConflictError);
  });

  it('Split-Refund Prevention (LIMIT-002): 5th refund exceeds cap and is DENIED by policy', async () => {
    // 5 refunds of $45.00 each against $200.00 cap
    for (let i = 1; i <= 4; i++) {
      const req: ActionRequest = {
        request_id: `req_split_${i}`,
        action_type: 'REFUND',
        payment_id: 'CAP-E2E-250',
        amount: createMoney(45.0, 'USD'),
        reason: `Split refund ${i}`,
        requester_id: 'agent_bob',
      };
      const fp = computeParamsFingerprint(req);
      const { operation } = repo.createOrGetOperation({
        ...req,
        params_fingerprint: fp,
        provider: 'mock',
      });

      repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);

      const facts = await loadPolicyFacts({
        caller_id: req.requester_id,
        payment_id: req.payment_id,
        repository: repo,
        adapter,
        config,
      });

      const evalRes = evaluate(req, facts, config);
      expect(evalRes.disposition).toBe(DispositionEnum.ALLOW); // First 4 are allowed

      repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
      await adapter.refund({
        operation_id: operation.operation_id,
        provider_idempotency_key: operation.provider_idempotency_key,
        capture_id: req.payment_id,
        amount: req.amount,
      });
      repo.transitionOperation(operation.operation_id, OperationStateEnum.SUCCEEDED);
    }

    // Attempt 5th refund ($45 * 4 = $180 completed + $45 = $225 > $200 cap)
    const req5: ActionRequest = {
      request_id: 'req_split_5',
      action_type: 'REFUND',
      payment_id: 'CAP-E2E-250',
      amount: createMoney(45.0, 'USD'),
      reason: 'Split refund 5',
      requester_id: 'agent_bob',
    };
    const fp5 = computeParamsFingerprint(req5);
    const { operation: op5 } = repo.createOrGetOperation({
      ...req5,
      params_fingerprint: fp5,
      provider: 'mock',
    });

    repo.transitionOperation(op5.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(op5.operation_id, OperationStateEnum.EVALUATING);

    const facts5 = await loadPolicyFacts({
      caller_id: req5.requester_id,
      payment_id: req5.payment_id,
      repository: repo,
      adapter,
      config,
    });

    const evalRes5 = evaluate(req5, facts5, config);
    // MUST BE DENIED BY LIMIT-002
    expect(evalRes5.disposition).toBe(DispositionEnum.DENY);
    expect(evalRes5.ruleIds).toContain('LIMIT-002');

    // Transitions to DENIED (terminal)
    const deniedOp = repo.transitionOperation(op5.operation_id, OperationStateEnum.DENIED, evalRes5.reasons[0]);
    expect(deniedOp.state).toBe(OperationStateEnum.DENIED);

    // Provider balance remains capped at $180 total refunds
    const captureFinal = await adapter.getCapture('CAP-E2E-250');
    expect(captureFinal.refunded_amount.amount_minor).toBe(18000);
  });

  it('Crash Mid-Execution Recovery (FR-11): Reconciles EXECUTING to OUTCOME_UNKNOWN and blocks blind retry', async () => {
    const request: ActionRequest = {
      request_id: 'req_crash_test',
      action_type: 'REFUND',
      payment_id: 'CAP-E2E-250',
      amount: createMoney(35.0, 'USD'),
      reason: 'Crash simulation',
      requester_id: 'agent_bob',
    };

    const fp = computeParamsFingerprint(request);
    const { operation } = repo.createOrGetOperation({
      ...request,
      params_fingerprint: fp,
      provider: 'mock',
    });

    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

    // Simulate process termination mid-call before response is received
    // On reboot:
    const { reconciledCount, operationIds } = reconcileStartupOperations(db, repo);
    expect(reconciledCount).toBe(1);
    expect(operationIds).toContain(operation.operation_id);

    const opAfterReboot = repo.getOperation(operation.operation_id)!;
    expect(opAfterReboot.state).toBe(OperationStateEnum.OUTCOME_UNKNOWN);

    // If an agent tries to re-evaluate or execute blind retry, facts loader spots OUTCOME_UNKNOWN
    const facts = await loadPolicyFacts({
      caller_id: request.requester_id,
      payment_id: request.payment_id,
      repository: repo,
      adapter,
      config,
    });
    expect(facts.prior_attempt_state).toBe(OperationStateEnum.OUTCOME_UNKNOWN);

    const policyResult = evaluate(request, facts, config);
    // UNCERTAIN-001 triggers: blind retry forbidden, escalates to PAUSE_REVIEW
    expect(policyResult.disposition).toBe(DispositionEnum.PAUSE_REVIEW);
    expect(policyResult.ruleIds).toContain('UNCERTAIN-001');
  });
});

