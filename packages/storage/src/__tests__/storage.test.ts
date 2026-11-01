import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../database.js';
import { AirlockRepository, IdempotencyConflictError } from '../repository.js';
import { reconcileStartupOperations } from '../reconciliation.js';
import {
  createMoney,
  computeParamsFingerprint,
  computeActionHash,
  OperationStateEnum,
} from '@airlock/contracts';
import type Database from 'better-sqlite3';

describe('Storage: AirlockRepository & Startup Reconciliation', () => {
  let db: Database.Database;
  let repo: AirlockRepository;

  beforeEach(() => {
    db = createDatabase({ path: ':memory:' });
    repo = new AirlockRepository(db);
  });

  describe('Operation Intake & Idempotency (IDEMP-001 & IDEMP-002)', () => {
    const baseRequest = {
      request_id: 'req_idem_001',
      action_type: 'REFUND',
      payment_id: 'CAP-TEST-100',
      amount: createMoney(25.0, 'USD'),
      reason: 'Customer return requested',
      requester_id: 'agent_bob',
    };

    it('IDEMP-001: intakes new operation as RECEIVED and assigns provider_idempotency_key', () => {
      const fingerprint = computeParamsFingerprint(baseRequest);
      const { operation, isNew } = repo.createOrGetOperation({
        ...baseRequest,
        params_fingerprint: fingerprint,
        provider: 'mock',
      });

      expect(isNew).toBe(true);
      expect(operation.state).toBe(OperationStateEnum.RECEIVED);
      expect(operation.provider_idempotency_key).toMatch(/^idemp_/);
      expect(operation.amount?.amount_minor).toBe(2500);
    });

    it('IDEMP-001: replaying the same request_id with same parameters returns the existing operation', () => {
      const fingerprint = computeParamsFingerprint(baseRequest);
      const res1 = repo.createOrGetOperation({
        ...baseRequest,
        params_fingerprint: fingerprint,
        provider: 'mock',
      });

      const res2 = repo.createOrGetOperation({
        ...baseRequest,
        params_fingerprint: fingerprint,
        provider: 'mock',
      });

      expect(res1.isNew).toBe(true);
      expect(res2.isNew).toBe(false);
      expect(res2.operation.operation_id).toBe(res1.operation.operation_id);
    });

    it('IDEMP-002: reusing request_id with modified parameters throws IdempotencyConflictError', () => {
      const fp1 = computeParamsFingerprint(baseRequest);
      repo.createOrGetOperation({
        ...baseRequest,
        params_fingerprint: fp1,
        provider: 'mock',
      });

      // Alter amount
      const alteredRequest = {
        ...baseRequest,
        amount: createMoney(50.0, 'USD'),
      };
      const fp2 = computeParamsFingerprint(alteredRequest);

      expect(() =>
        repo.createOrGetOperation({
          ...alteredRequest,
          params_fingerprint: fp2,
          provider: 'mock',
        })
      ).toThrow(IdempotencyConflictError);
    });
  });

  describe('Guarded State Machine Enforcement in Storage', () => {
    it('transitions through allowed lifecycle states', () => {
      const fp = computeParamsFingerprint({
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
      });

      const { operation } = repo.createOrGetOperation({
        request_id: 'req_state_001',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
        requester_id: 'user_1',
      });

      // RECEIVED -> VALIDATING
      const op2 = repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      expect(op2.state).toBe(OperationStateEnum.VALIDATING);

      // VALIDATING -> EVALUATING
      const op3 = repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
      expect(op3.state).toBe(OperationStateEnum.EVALUATING);

      // EVALUATING -> READY
      const op4 = repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      expect(op4.state).toBe(OperationStateEnum.READY);

      // READY -> EXECUTING
      const op5 = repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);
      expect(op5.state).toBe(OperationStateEnum.EXECUTING);

      // EXECUTING -> SUCCEEDED
      const op6 = repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.SUCCEEDED,
        undefined,
        'REFUND-PROV-123'
      );
      expect(op6.state).toBe(OperationStateEnum.SUCCEEDED);
      expect(op6.provider_operation_id).toBe('REFUND-PROV-123');
    });

    it('rejects forbidden transitions (e.g., jumping from RECEIVED directly to SUCCEEDED)', () => {
      const fp = computeParamsFingerprint({
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
      });

      const { operation } = repo.createOrGetOperation({
        request_id: 'req_state_illegal',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
        requester_id: 'user_1',
      });

      expect(() =>
        repo.transitionOperation(operation.operation_id, OperationStateEnum.SUCCEEDED)
      ).toThrow();
    });
  });

  describe('Approval Workflow & Separation of Duties (APPROVAL-002)', () => {
    it('blocks self-approval when requester attempts to approve their own request', () => {
      const fp = computeParamsFingerprint({ action_type: 'REFUND', payment_id: 'CAP-1', reason: 'test' });
      const { operation } = repo.createOrGetOperation({
        request_id: 'req_app_01',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
        requester_id: 'agent_alice',
      });

      const action_hash = computeActionHash({
        operation_id: operation.operation_id,
        payment_id: 'CAP-1',
        requester_id: 'agent_alice',
        provider: 'mock',
      });

      const approval = repo.createApproval({
        operation_id: operation.operation_id,
        action_hash,
        requester_id: 'agent_alice',
      });

      // Self-approval attempt
      expect(() =>
        repo.submitApproval({
          approval_id: approval.approval_id,
          approver_id: 'agent_alice', // SAME as requester
          approver_role: 'approver',
          approved: true,
        })
      ).toThrow(/Self-approval forbidden/);
    });

    it('allows approval from a different approver and enforces single-use consumption', () => {
      const fp = computeParamsFingerprint({ action_type: 'REFUND', payment_id: 'CAP-1', reason: 'test' });
      const { operation } = repo.createOrGetOperation({
        request_id: 'req_app_02',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-1',
        reason: 'test',
        requester_id: 'agent_alice',
      });

      const action_hash = computeActionHash({
        operation_id: operation.operation_id,
        payment_id: 'CAP-1',
        requester_id: 'agent_alice',
        provider: 'mock',
      });

      const approval = repo.createApproval({
        operation_id: operation.operation_id,
        action_hash,
        requester_id: 'agent_alice',
      });

      // Distinct approver
      const approved = repo.submitApproval({
        approval_id: approval.approval_id,
        approver_id: 'manager_carol',
        approver_role: 'approver',
        approved: true,
      });

      expect(approved.status).toBe('APPROVED');
      expect(approved.approver_id).toBe('manager_carol');

      // Consume approval
      repo.consumeApproval(approval.approval_id);

      // Re-consuming throws
      expect(() => repo.consumeApproval(approval.approval_id)).toThrow(/not in APPROVED state/);
    });
  });

  describe('Startup Reconciliation (FR-11)', () => {
    it('moves any operation left in EXECUTING to OUTCOME_UNKNOWN upon system restart', () => {
      const fp = computeParamsFingerprint({
        action_type: 'REFUND',
        payment_id: 'CAP-CRASH',
        reason: 'test crash',
      });

      const { operation } = repo.createOrGetOperation({
        request_id: 'req_crash_01',
        params_fingerprint: fp,
        provider: 'mock',
        action_type: 'REFUND',
        payment_id: 'CAP-CRASH',
        reason: 'test crash',
        requester_id: 'user_1',
      });

      // Move into EXECUTING
      repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
      repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

      // Simulate system crash & restart
      const { reconciledCount, operationIds } = reconcileStartupOperations(db, repo);

      expect(reconciledCount).toBe(1);
      expect(operationIds).toContain(operation.operation_id);

      const opAfter = repo.getOperation(operation.operation_id)!;
      expect(opAfter.state).toBe(OperationStateEnum.OUTCOME_UNKNOWN);
    });
  });
});
