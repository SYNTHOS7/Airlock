import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, AirlockRepository } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { createPolicyConfig } from '@airlock/policy-engine';
import { ApprovalService } from '../approval-service.js';
import { ExecutionService } from '../execution-service.js';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  ToolStatusEnum,
} from '@airlock/contracts';
import type Database from 'better-sqlite3';

describe('Day 3: Approvals, Recheck-Before-Execution & Separation of Duties', () => {
  let db: Database.Database;
  let repo: AirlockRepository;
  let adapter: MockProviderAdapter;
  let approvalService: ApprovalService;
  let executionService: ExecutionService;

  const config = createPolicyConfig({
    approval_threshold_minor: 5000, // $50.00
    cumulative_cap_minor: 20000, // $200.00
  });

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    repo = new AirlockRepository(db);
    adapter = new MockProviderAdapter('success');
    adapter.seedCapture('CAP-APP-100', createMoney(100.0, 'USD'));

    approvalService = new ApprovalService(repo);
    executionService = new ExecutionService(repo, adapter, config);
  });

  function createTestOp(amountMinor = 6000, requesterId = 'agent_1') {
    const amount = createMoney(amountMinor / 100, 'USD');
    const req = {
      action_type: 'REFUND',
      payment_id: 'CAP-APP-100',
      amount,
      reason: 'Customer return over threshold',
    };
    const fp = computeParamsFingerprint(req);
    const { operation } = repo.createOrGetOperation({
      request_id: `req_${Math.random()}`,
      params_fingerprint: fp,
      provider: 'mock',
      action_type: 'REFUND',
      payment_id: 'CAP-APP-100',
      amount,
      reason: req.reason,
      requester_id: requesterId,
    });
    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    return operation;
  }

  it('initiates approval request with action hash and transitions to AWAITING_APPROVAL', async () => {
    const op = createTestOp();
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    expect(approval.status).toBe('PENDING');
    expect(approval.action_hash).toBeDefined();
    expect(approval.requester_id).toBe('agent_1');

    const updatedOp = repo.getOperation(op.operation_id)!;
    expect(updatedOp.state).toBe(OperationStateEnum.AWAITING_APPROVAL);
  });

  it('APPROVAL-002: Rejects self-approval when requester attempts to approve their own action', async () => {
    const op = createTestOp(6000, 'agent_1');
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    // agent_1 tries to approve agent_1's request
    await expect(
      approvalService.approve({
        approval_id: approval.approval_id,
        approver_id: 'agent_1',
        approver_roles: ['approver'],
      })
    ).rejects.toThrow(/Self-approval forbidden/);
  });

  it('APPROVAL-002: Rejects approval when user lacks the approver role', async () => {
    const op = createTestOp(6000, 'agent_1');
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    // viewer tries to approve
    await expect(
      approvalService.approve({
        approval_id: approval.approval_id,
        approver_id: 'viewer_1',
        approver_roles: ['viewer'],
      })
    ).rejects.toThrow(/lacks the 'approver' role/);
  });

  it('APPROVAL-002: Rejects expired approval', async () => {
    const op = createTestOp();
    // Negative TTL creates an already expired approval
    const approval = await approvalService.requestApproval({
      operation_id: op.operation_id,
      ttlSeconds: -10,
    });

    await expect(
      approvalService.approve({
        approval_id: approval.approval_id,
        approver_id: 'approver_1',
        approver_roles: ['approver'],
      })
    ).rejects.toThrow(/expired/);
  });

  it('Rejection moves operation to DENIED', async () => {
    const op = createTestOp();
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    const rejected = await approvalService.reject({
      approval_id: approval.approval_id,
      approver_id: 'approver_1',
      approver_roles: ['approver'],
      reason: 'Suspicious request pattern',
    });

    expect(rejected.status).toBe('REJECTED');
    const updatedOp = repo.getOperation(op.operation_id)!;
    expect(updatedOp.state).toBe(OperationStateEnum.DENIED);
  });

  it('Pre-Execution Recheck: Blocks execution if facts change after approval (e.g. balance drained)', async () => {
    const op = createTestOp(8000, 'agent_1'); // $80.00 refund against $100.00 capture
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    // approver_1 approves -> operation moves to READY
    await approvalService.approve({
      approval_id: approval.approval_id,
      approver_id: 'approver_1',
      approver_roles: ['approver'],
    });

    const readyOp = repo.getOperation(op.operation_id)!;
    expect(readyOp.state).toBe(OperationStateEnum.READY);

    // Concurrent event: another refund deducts $50.00 directly from the capture,
    // leaving only $50.00 remaining refundable balance!
    await adapter.refund({
      operation_id: 'op_concurrent_drain',
      provider_idempotency_key: 'idemp_drain',
      capture_id: 'CAP-APP-100',
      amount: createMoney(50.0, 'USD'),
    });

    // Now try to execute the approved $80.00 refund
    // Fresh recheck should detect remaining balance ($50) < requested ($80) and BLOCK execution!
    const result = await executionService.executeApproved({
      operation_id: op.operation_id,
      approver_id: 'approver_1',
    });

    expect(result.status).toBe(ToolStatusEnum.BLOCKED);
    expect(result.reason).toContain('LIMIT-001');

    const blockedOp = repo.getOperation(op.operation_id)!;
    expect(blockedOp.state).toBe(OperationStateEnum.DENIED);
  });

  it('Full Path on Mock: Requester requests, approver approves, precheck passes, executes once, replayed execution refused', async () => {
    const op = createTestOp(7500, 'agent_1'); // $75.00
    const approval = await approvalService.requestApproval({ operation_id: op.operation_id });

    // 1. Requester cannot approve
    await expect(
      approvalService.approve({
        approval_id: approval.approval_id,
        approver_id: 'agent_1',
        approver_roles: ['approver'],
      })
    ).rejects.toThrow();

    // 2. Approver approves
    await approvalService.approve({
      approval_id: approval.approval_id,
      approver_id: 'approver_1',
      approver_roles: ['approver'],
    });

    // 3. Execution succeeds
    const execResult = await executionService.executeApproved({
      operation_id: op.operation_id,
      approver_id: 'approver_1',
    });

    expect(execResult.status).toBe(ToolStatusEnum.SUCCESS);
    expect(execResult.state).toBe(OperationStateEnum.SUCCEEDED);

    const finalOp = repo.getOperation(op.operation_id)!;
    expect(finalOp.state).toBe(OperationStateEnum.SUCCEEDED);

    // 4. Atomic consume prevents replay of approval
    await expect(
      executionService.executeApproved({
        operation_id: op.operation_id,
        approver_id: 'approver_1',
      })
    ).rejects.toThrow(/must be 'READY' to execute/);
  });
});

