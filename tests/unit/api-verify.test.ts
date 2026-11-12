import { describe, it, expect, beforeEach } from 'vitest';
import { POST } from '@/app/api/verify/route';
import { createDatabase, AirlockRepository } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { createPolicyConfig } from '@airlock/policy-engine';
import { ApprovalService, ExecutionService } from '@airlock/mcp-server';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  ProviderRefundStatusEnum,
} from '@airlock/contracts';

describe('POST /api/verify handler & OutcomeVerifier integration', () => {
  let db: any;
  let repo: AirlockRepository;
  let adapter: MockProviderAdapter;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    repo = new AirlockRepository(db);
    adapter = new MockProviderAdapter('success');

    const config = createPolicyConfig();
    const approvalService = new ApprovalService(repo);
    const executionService = new ExecutionService(repo, adapter, config);

    // Wire global test instance for getAirlock()
    (global as any).__airlockInstance = {
      db,
      repo,
      adapter,
      approvalService,
      executionService,
      config,
    };
  });

  async function setupExecutedOp(params: {
    operation_id: string;
    requester_id: string;
    targetState?: (typeof OperationStateEnum)[keyof typeof OperationStateEnum];
    refundStatus?: (typeof ProviderRefundStatusEnum)[keyof typeof ProviderRefundStatusEnum];
  }) {
    const baseRequest = {
      request_id: `req_${params.operation_id}`,
      action_type: 'REFUND',
      payment_id: 'CAP-DEFAULT-100',
      amount: createMoney(35.0, 'USD'),
      reason: 'Standard customer refund',
      requester_id: params.requester_id,
    };
    const fingerprint = computeParamsFingerprint(baseRequest);
    const { operation } = repo.createOrGetOperation({
      ...baseRequest,
      params_fingerprint: fingerprint,
      provider: 'mock',
    });

    const refundResult = await adapter.refund({
      operation_id: operation.operation_id,
      provider_idempotency_key: operation.provider_idempotency_key,
      capture_id: operation.payment_id,
      amount: operation.amount ?? undefined,
    });

    if (params.refundStatus && params.refundStatus !== ProviderRefundStatusEnum.COMPLETED) {
      (adapter as any).refunds.get(refundResult.provider_refund_id).status = params.refundStatus;
    }

    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);

    const endState = params.targetState || OperationStateEnum.SUCCEEDED;
    if (endState === OperationStateEnum.EXECUTING) {
      repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.EXECUTING,
        'Dispatched to rail',
        refundResult.provider_refund_id
      );
    } else {
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
      repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.SUCCEEDED,
        'Dispatched to rail',
        refundResult.provider_refund_id
      );
    }

    return { operation: repo.getOperation(operation.operation_id)!, refundResult };
  }

  // ── 1. Authentication & Role-Based Authorization ────────────────────────────

  it('fails with 401 Unauthorized when no identity header is provided', async () => {
    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation_id: 'op_123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  it('fails with 401 Unauthorized when identity is invalid', async () => {
    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'unknown_adversary',
      },
      body: JSON.stringify({ operation_id: 'op_123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('fails with 400 Bad Request when operation_id is missing', async () => {
    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'viewer_1',
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('operation_id is required');
  });

  it('fails with 404 Not Found when operation_id does not exist', async () => {
    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'viewer_1',
      },
      body: JSON.stringify({ operation_id: 'non_existent_op_999' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('not found');
  });

  it('fails with 403 Forbidden when a support agent tries to verify an operation requested by another user', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_foreign_1',
      requester_id: 'agent_bob', // Requested by someone else
    });

    // Agent Sarah (agent_1) tries to verify agent_bob's operation
    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'agent_1',
      },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden: Support agents may only verify their own operations.');
  });

  it('allows a support agent to verify an operation they requested', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_sarah_1',
      requester_id: 'agent_1', // Agent Sarah requested it
    });

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'agent_1',
      },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verification).toBeDefined();
    expect(json.verification.outcome).toBe('VERIFIED_SUCCESS');
  });

  it('allows an approver to verify any operation regardless of requester', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_any_1',
      requester_id: 'agent_1',
    });

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'approver_1',
      },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verification.outcome).toBe('VERIFIED_SUCCESS');
  });

  it('allows a viewer (auditor) to verify any operation', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_any_2',
      requester_id: 'agent_1',
    });

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-airlock-user': 'viewer_1',
      },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verification.outcome).toBe('VERIFIED_SUCCESS');
  });

  // ── 2. Outcome Distinctions: VERIFIED_SUCCESS, VERIFIED_FAILURE, UNRESOLVED ───

  it('returns VERIFIED_SUCCESS when provider lookup confirms completed status', async () => {
    const { operation: op, refundResult } = await setupExecutedOp({
      operation_id: 'op_success_verify',
      requester_id: 'approver_1',
    });

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-airlock-user': 'approver_1' },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verification.outcome).toBe('VERIFIED_SUCCESS');
    expect(data.verification.status).toBe('COMPLETED');
    expect(data.verification.provider_reference).toBe(refundResult.provider_refund_id);
    expect(data.verification.evidence_id).toBeDefined();
  });

  it('returns VERIFIED_FAILURE when provider reports refund failed', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_failed_verify',
      requester_id: 'approver_1',
      targetState: OperationStateEnum.EXECUTING,
      refundStatus: ProviderRefundStatusEnum.FAILED,
    });

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-airlock-user': 'approver_1' },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verification.outcome).toBe('VERIFIED_FAILURE');
    expect(data.verification.status).toBe('FAILED');
    expect(data.verification.reason).toContain('failed by provider');
  });

  it('returns UNRESOLVED when outcome cannot be verified with certainty', async () => {
    const baseRequest = {
      request_id: 'req_unresolved_1',
      action_type: 'REFUND',
      payment_id: 'CAP-DEFAULT-100',
      amount: createMoney(35.0, 'USD'),
      reason: 'Standard customer refund',
      requester_id: 'approver_1',
    };
    const fingerprint = computeParamsFingerprint(baseRequest);
    const { operation } = repo.createOrGetOperation({
      ...baseRequest,
      params_fingerprint: fingerprint,
      provider: 'mock',
    });
    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
    repo.transitionOperation(
      operation.operation_id,
      OperationStateEnum.OUTCOME_UNKNOWN,
      'Lost response connection'
    );

    // Make replay throw to simulate network timeout on inquiry
    const originalRefund = adapter.refund.bind(adapter);
    adapter.refund = async () => {
      throw new Error('Rail network timeout');
    };

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-airlock-user': 'approver_1' },
      body: JSON.stringify({ operation_id: operation.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.verification.outcome).toBe('UNRESOLVED');
    expect(data.verification.status).toBe('UNRESOLVED');
    expect(data.verification.reason).toContain('Could not prove provider outcome with certainty');

    // Restore adapter
    adapter.refund = originalRefund;
  });

  it('returns HTTP 500 when an internal runtime exception occurs during verification', async () => {
    const { operation: op } = await setupExecutedOp({
      operation_id: 'op_err_verify',
      requester_id: 'viewer_1',
    });

    // Cause repo.getOperation to throw unexpected database failure
    const originalGetOp = repo.getOperation.bind(repo);
    let callCount = 0;
    repo.getOperation = (id: string) => {
      callCount++;
      // First call is in route handler check, let that pass or fail in verifier
      if (callCount > 1) {
        throw new Error('Database disk I/O failure');
      }
      return originalGetOp(id);
    };

    const req = new Request('http://localhost:3000/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-airlock-user': 'viewer_1' },
      body: JSON.stringify({ operation_id: op.operation_id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Database disk I/O failure');

    repo.getOperation = originalGetOp;
  });
});
