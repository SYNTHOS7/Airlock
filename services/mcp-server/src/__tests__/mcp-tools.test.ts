import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, AirlockRepository } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { createPolicyConfig } from '@airlock/policy-engine';
import {
  OperationStateEnum,
  ToolStatusEnum,
  DispositionEnum,
  computeActionHash,
  createMoney,
} from '@airlock/contracts';
import { ApprovalService } from '../approval-service.js';
import { ExecutionService } from '../execution-service.js';
import { AirlockMcpTools } from '../tools.js';
import { DEMO_USERS } from '../auth.js';

describe('Day 6 Block 3: Four MCP Tools Protocol & Safety Hardening', () => {
  let db: Database.Database;
  let repo: AirlockRepository;
  let adapter: MockProviderAdapter;
  let approvalService: ApprovalService;
  let executionService: ExecutionService;
  let tools: AirlockMcpTools;

  const agentUser = DEMO_USERS.agent_1;
  const approverUser = DEMO_USERS.approver_1;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);
    repo = new AirlockRepository(db);
    adapter = new MockProviderAdapter('success');
    adapter.seedCapture('CAP-100', createMoney(500.0, 'USD'));
    const config = createPolicyConfig({
      approval_threshold_minor: 5000, // $50.00
      cumulative_cap_minor: 20000, // $200.00
    });
    approvalService = new ApprovalService(repo);
    executionService = new ExecutionService(repo, adapter, config);
    tools = new AirlockMcpTools(repo, adapter, config, approvalService, executionService);
  });

  describe('Tool 1: evaluate_action', () => {
    it('evaluates small amount and allows without approval', async () => {
      const result = await tools.evaluateAction(
        {
          request_id: 'req_eval_01',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 3000, // $30.00
          currency: 'USD',
          reason: 'Customer returned item in original condition',
        },
        { user: agentUser }
      );

      expect(result.status).toBe(ToolStatusEnum.SUCCESS);
      expect(result.state).toBe(OperationStateEnum.READY);
      expect(result.disposition).toBe(DispositionEnum.ALLOW);
      expect(result.operation_id).toBeDefined();
    });

    it('requires human approval when amount exceeds threshold ($50.00)', async () => {
      const result = await tools.evaluateAction(
        {
          request_id: 'req_eval_02',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 7500, // $75.00
          currency: 'USD',
          reason: 'Customer requested full goodwill gesture refund',
        },
        { user: agentUser }
      );

      expect(result.status).toBe(ToolStatusEnum.REQUIRES_APPROVAL);
      expect(result.state).toBe(OperationStateEnum.AWAITING_APPROVAL);
      expect(result.disposition).toBe(DispositionEnum.REQUIRE_APPROVAL);
      expect((result.data as any).rule_ids).toContain('APPROVAL-001');
      expect(result.reason).toContain('exceeds auto-approval threshold');
    });

    it('enforces idempotency on repeated request (IDEMP-001)', async () => {
      const input = {
        request_id: 'req_eval_repeat',
        payment_id: 'CAP-100',
        action_type: 'REFUND' as const,
        amount_minor: 2500,
        currency: 'USD',
        reason: 'Duplicate intake test',
      };

      const first = await tools.evaluateAction(input, { user: agentUser });
      const second = await tools.evaluateAction(input, { user: agentUser });

      expect(second.operation_id).toBe(first.operation_id);
      expect((second.data as any).replayed).toBe(true);
    });

    it('rejects same request_id with altered parameters (IDEMP-002)', async () => {
      await tools.evaluateAction(
        {
          request_id: 'req_eval_conflict',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 2000,
          currency: 'USD',
          reason: 'Original request',
        },
        { user: agentUser }
      );

      await expect(
        tools.evaluateAction(
          {
            request_id: 'req_eval_conflict',
            payment_id: 'CAP-100',
            action_type: 'REFUND',
            amount_minor: 9900, // Altered amount
            currency: 'USD',
            reason: 'Tampered duplicate request',
          },
          { user: agentUser }
        )
      ).rejects.toThrow(/IDEMP-002/);
    });

    it('fails validation on negative or zero amounts', async () => {
      await expect(
        tools.evaluateAction(
          {
            request_id: 'req_bad_amt',
            payment_id: 'CAP-100',
            action_type: 'REFUND',
            amount_minor: -500,
            currency: 'USD',
            reason: 'Invalid negative amount',
          },
          { user: agentUser }
        )
      ).rejects.toThrow();
    });
  });

  describe('Tool 2: request_approval', () => {
    it('creates approval bound to action hash for operations in AWAITING_APPROVAL', async () => {
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_appr_01',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 8000, // $80.00 -> requires approval
          currency: 'USD',
          reason: 'Customer damaged item replacement refund',
        },
        { user: agentUser }
      );

      const apprRes = await tools.requestApproval(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      expect(apprRes.status).toBe(ToolStatusEnum.REQUIRES_APPROVAL);
      expect(apprRes.data).toBeDefined();
      const data = apprRes.data as any;
      expect(data.action_hash).toBeDefined();
      expect(data.status).toBe('PENDING');
      expect(data.expires_at).toBeDefined();
    });

    it('blocks request_approval if operation is not in AWAITING_APPROVAL state', async () => {
      // Create operation in READY state (under threshold)
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_appr_auto',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 2000, // $20.00 -> ALLOW
          currency: 'USD',
          reason: 'Small refund under threshold',
        },
        { user: agentUser }
      );

      const apprRes = await tools.requestApproval(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      expect(apprRes.status).toBe(ToolStatusEnum.BLOCKED);
      expect(apprRes.reason).toContain('requires \'AWAITING_APPROVAL\'');
    });
  });

  describe('Tool 3: execute_approved_action', () => {
    it('executes directly if operation was ALLOW (READY state)', async () => {
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_exec_allow',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 1500, // $15.00
          currency: 'USD',
          reason: 'Auto-allowed refund',
        },
        { user: agentUser }
      );

      const execRes = await tools.executeApprovedAction(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      expect(execRes.status).toBe(ToolStatusEnum.SUCCESS);
      expect(execRes.state).toBe(OperationStateEnum.SUCCEEDED);
      expect(execRes.evidence_refs.length).toBeGreaterThan(0);
    });

    it('blocks execution if approval is required but not yet granted', async () => {
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_exec_unapproved',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 9000,
          currency: 'USD',
          reason: 'High amount requiring approval',
        },
        { user: agentUser }
      );

      await tools.requestApproval(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      const execRes = await tools.executeApprovedAction(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      expect(execRes.status).toBe(ToolStatusEnum.BLOCKED);
      expect(execRes.reason).toContain('Operation requires approval');
    });

    it('executes successfully once approver grants approval (enforcing separation of duties)', async () => {
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_exec_approved',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 9000,
          currency: 'USD',
          reason: 'High amount requiring approval',
        },
        { user: agentUser }
      );

      const apprRes = await tools.requestApproval(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      const approvalId = (apprRes.data as any).approval_id;

      // Approver grants approval
      approvalService.approve({
        approval_id: approvalId,
        approver_id: approverUser.id,
        approver_roles: approverUser.roles,
      });

      // Execute approved action
      const execRes = await tools.executeApprovedAction(
        { operation_id: evalRes.operation_id },
        { user: approverUser }
      );

      expect(execRes.status).toBe(ToolStatusEnum.SUCCESS);
      expect(execRes.state).toBe(OperationStateEnum.SUCCEEDED);

      // Verify approval was consumed atomically
      const approvalRecord = repo.getApproval(approvalId);
      expect(approvalRecord?.status).toBe('CONSUMED');
    });
  });

  describe('Tool 4: verify_outcome', () => {
    it('returns verified success for completed operations', async () => {
      const evalRes = await tools.evaluateAction(
        {
          request_id: 'req_verify_done',
          payment_id: 'CAP-100',
          action_type: 'REFUND',
          amount_minor: 2500,
          currency: 'USD',
          reason: 'Immediate completion',
        },
        { user: agentUser }
      );

      await tools.executeApprovedAction(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      const verifyRes = await tools.verifyOutcome(
        { operation_id: evalRes.operation_id },
        { user: agentUser }
      );

      expect(verifyRes.status).toBe(ToolStatusEnum.SUCCESS);
      expect(verifyRes.state).toBe(OperationStateEnum.SUCCEEDED);
      expect(verifyRes.evidence_refs.length).toBeGreaterThan(0);
    });
  });
});
