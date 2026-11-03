import { z } from 'zod';
import {
  type ActionRequest,
  type ToolResult,
  type ToolStatus,
  type OperationState,
  ToolStatusEnum,
  OperationStateEnum,
  DispositionEnum,
  createMoney,
  computeParamsFingerprint,
  mergeDispositions,
  mapJevSignalsToDisposition,
  type Disposition,
  type JevSignals,
  type ProviderAdapter,
} from '@airlock/contracts';
import { type AirlockRepository } from '@airlock/storage';
import {
  evaluate,
  loadPolicyFacts,
  type PolicyConfig,
  type JevClient,
  buildJevInput,
} from '@airlock/policy-engine';
import { OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { type ApprovalService } from './approval-service.js';
import { type ExecutionService } from './execution-service.js';
import { type DemoUser } from './auth.js';

/**
 * Strict Zod Schemas for the 4 Airlock MCP Tools (Spec Part II Section 12, Day 6 Block 3).
 * Invariant: Caller identity NEVER appears in tool arguments; it comes strictly from auth.
 */
export const EvaluateActionInputSchema = z.object({
  request_id: z.string().min(1, 'request_id is required').describe("Client's unique idempotent request ID"),
  payment_id: z.string().min(1, 'payment_id is required').describe('Provider capture or payment ID (e.g. CAP-12345)'),
  action_type: z.literal('REFUND').default('REFUND').describe('Action type to evaluate (REFUND)'),
  amount_minor: z.number().int().positive().optional().describe('Amount in minor currency units (e.g. 2500 for $25.00)'),
  currency: z.string().length(3).default('USD').describe('ISO 4217 three-letter currency code'),
  reason: z.string().min(1, 'reason is required').describe('Stated reason for the requested action'),
});

export type EvaluateActionInput = z.infer<typeof EvaluateActionInputSchema>;

export const RequestApprovalInputSchema = z.object({
  operation_id: z.string().min(1, 'operation_id is required').describe('Operation ID awaiting approval'),
});

export type RequestApprovalInput = z.infer<typeof RequestApprovalInputSchema>;

export const ExecuteApprovedActionInputSchema = z.object({
  operation_id: z.string().min(1, 'operation_id is required').describe('Operation ID to execute'),
});

export type ExecuteApprovedActionInput = z.infer<typeof ExecuteApprovedActionInputSchema>;

export const VerifyOutcomeInputSchema = z.object({
  operation_id: z.string().min(1, 'operation_id is required').describe('Operation ID to verify and reconcile'),
});

export type VerifyOutcomeInput = z.infer<typeof VerifyOutcomeInputSchema>;

export interface McpContext {
  user: DemoUser;
}

export class AirlockMcpTools {
  private verifier: OutcomeVerifier;

  constructor(
    private repo: AirlockRepository,
    private adapter: ProviderAdapter,
    private config: PolicyConfig,
    private approvalService: ApprovalService,
    private executionService: ExecutionService,
    private jevClient?: JevClient
  ) {
    this.verifier = new OutcomeVerifier(this.repo, this.adapter);
  }

  /**
   * Tool 1: evaluate_action
   * No side effects beyond the operation record and decision record.
   * Idempotent by request_id. Returns disposition and reasons.
   */
  public async evaluateAction(
    rawInput: unknown,
    context: McpContext
  ): Promise<ToolResult> {
    const input = EvaluateActionInputSchema.parse(rawInput);
    const user = context.user;

    const amount =
      input.amount_minor != null
        ? createMoney(input.amount_minor / 100, input.currency)
        : undefined;

    const actionRequest: ActionRequest = {
      request_id: input.request_id,
      action_type: 'REFUND',
      payment_id: input.payment_id,
      amount,
      reason: input.reason,
      requester_id: user.id,
    };

    // 1. Idempotency Check (IDEMP-001 & IDEMP-002)
    const fp = computeParamsFingerprint(actionRequest);
    const { operation, isNew } = this.repo.createOrGetOperation({
      ...actionRequest,
      params_fingerprint: fp,
      provider: this.adapter.providerName,
    });

    if (!isNew) {
      const existingDecision = this.repo.getDecisionByOperationId(operation.operation_id);
      let replayedStatus: ToolStatus = ToolStatusEnum.PAUSED_FOR_REVIEW;
      if (operation.state === OperationStateEnum.SUCCEEDED) {
        replayedStatus = ToolStatusEnum.SUCCESS;
      } else if (operation.state === OperationStateEnum.DENIED) {
        replayedStatus = ToolStatusEnum.BLOCKED;
      } else if (operation.state === OperationStateEnum.AWAITING_APPROVAL) {
        replayedStatus = ToolStatusEnum.REQUIRES_APPROVAL;
      }

      return {
        status: replayedStatus,
        reason: existingDecision?.policy_reason ?? 'Operation already evaluated (idempotent replay).',
        evidence_refs: [],
        operation_id: operation.operation_id,
        state: operation.state,
        disposition: existingDecision?.final_disposition as Disposition,
        data: {
          replayed: true,
          operation,
          decision: existingDecision,
        },
      };
    }

    // 2. Validate & Evaluate
    this.repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
    this.repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);

    const facts = await loadPolicyFacts({
      caller_id: user.id,
      payment_id: actionRequest.payment_id,
      repository: this.repo,
      adapter: this.adapter,
      config: this.config,
      caller_roles: user.roles,
      current_operation_id: operation.operation_id,
    });

    const policyResult = evaluate(actionRequest, facts, this.config);
    let finalDisposition: Disposition = policyResult.disposition;
    let jevStatus: 'ran' | 'unavailable' | 'invalid' = 'unavailable';
    let jevSignals: JevSignals | undefined = undefined;
    const finalReasons = [...policyResult.reasons];

    // If Jev client is active, evaluate untrusted text and merge monotonically
    if (this.jevClient) {
      try {
        const jevInput = buildJevInput(actionRequest, facts);
        const jevResponse = await this.jevClient.evaluateSignals(jevInput);
        jevStatus = jevResponse.status;
        jevSignals = jevResponse.signals;

        if (jevResponse.signals) {
          const jevDisposition = mapJevSignalsToDisposition(jevResponse.signals);
          finalDisposition = mergeDispositions(
            policyResult.disposition,
            jevDisposition
          );
          if (jevResponse.signals.explanation) {
            finalReasons.push(`Jev signal [${jevResponse.signals.route}]: ${jevResponse.signals.explanation}`);
          }
        }
      } catch (err: any) {
        jevStatus = 'unavailable';
        // Monotonic fail-safe: Jev error degrades ALLOW to REQUIRE_APPROVAL
        if (finalDisposition === DispositionEnum.ALLOW) {
          finalDisposition = DispositionEnum.REQUIRE_APPROVAL;
          finalReasons.push('Jev evaluation service unavailable: failing closed to human review (FAIL-SAFE).');
        }
      }
    }

    // Record decision in append-only storage
    this.repo.recordDecision({
      operation_id: operation.operation_id,
      jev_status: jevStatus,
      jev_signals: jevSignals,
      policy_result: policyResult.disposition,
      policy_rule_ids: policyResult.ruleIds,
      policy_reason: finalReasons.join('; '),
      final_disposition: finalDisposition,
    });

    // Transition operation to corresponding resting state
    let targetState: OperationState = OperationStateEnum.READY;
    let toolStatus: ToolStatus = ToolStatusEnum.SUCCESS;

    if (finalDisposition === DispositionEnum.DENY) {
      targetState = OperationStateEnum.DENIED;
      toolStatus = ToolStatusEnum.BLOCKED;
    } else if (finalDisposition === DispositionEnum.REQUIRE_APPROVAL) {
      targetState = OperationStateEnum.AWAITING_APPROVAL;
      toolStatus = ToolStatusEnum.REQUIRES_APPROVAL;
    } else if (finalDisposition === DispositionEnum.PAUSE_REVIEW) {
      targetState = OperationStateEnum.NEEDS_REVIEW;
      toolStatus = ToolStatusEnum.PAUSED_FOR_REVIEW;
    }

    const updatedOp = this.repo.transitionOperation(
      operation.operation_id,
      targetState,
      finalReasons[0] || 'Policy evaluation completed.'
    );

    return {
      status: toolStatus,
      reason: finalReasons.join('; '),
      evidence_refs: [],
      operation_id: updatedOp.operation_id,
      state: updatedOp.state,
      disposition: finalDisposition,
      data: {
        operation: updatedOp,
        rule_ids: policyResult.ruleIds,
        reasons: finalReasons,
      },
    };
  }

  /**
   * Tool 2: request_approval
   * Only valid when disposition is REQUIRE_APPROVAL.
   */
  public async requestApproval(
    rawInput: unknown,
    context: McpContext
  ): Promise<ToolResult> {
    const input = RequestApprovalInputSchema.parse(rawInput);
    const op = this.repo.getOperation(input.operation_id);

    if (!op) {
      return {
        status: ToolStatusEnum.FAILED,
        reason: `Operation '${input.operation_id}' not found.`,
        evidence_refs: [],
        operation_id: input.operation_id,
      };
    }

    if (op.state !== OperationStateEnum.AWAITING_APPROVAL) {
      return {
        status: ToolStatusEnum.BLOCKED,
        reason: `Cannot request approval: operation is in '${op.state}' state (requires 'AWAITING_APPROVAL').`,
        evidence_refs: [],
        operation_id: op.operation_id,
        state: op.state,
      };
    }

    const approval = await this.approvalService.requestApproval({
      operation_id: op.operation_id,
    });

    return {
      status: ToolStatusEnum.REQUIRES_APPROVAL,
      reason: `Human approval requested. Bound to action hash: ${approval.action_hash}`,
      evidence_refs: [],
      operation_id: op.operation_id,
      state: OperationStateEnum.AWAITING_APPROVAL,
      disposition: DispositionEnum.REQUIRE_APPROVAL,
      data: {
        approval_id: approval.approval_id,
        action_hash: approval.action_hash,
        expires_at: approval.expires_at,
        status: approval.status,
      },
    };
  }

  /**
   * Tool 3: execute_approved_action
   * Needs a valid, unexpired, unconsumed approval or ALLOW state.
   * Re-runs policy first immediately before dispatch.
   */
  public async executeApprovedAction(
    rawInput: unknown,
    context: McpContext
  ): Promise<ToolResult> {
    const input = ExecuteApprovedActionInputSchema.parse(rawInput);
    const user = context.user;

    const op = this.repo.getOperation(input.operation_id);
    if (!op) {
      return {
        status: ToolStatusEnum.FAILED,
        reason: `Operation '${input.operation_id}' not found.`,
        evidence_refs: [],
        operation_id: input.operation_id,
      };
    }

    // If operation was already ALLOW (state was READY), we can execute directly
    // If it was AWAITING_APPROVAL, it must have an approval record in APPROVED state
    if (op.state === OperationStateEnum.AWAITING_APPROVAL) {
      const approval = this.repo.getApprovalByOperationId(op.operation_id);
      if (!approval || approval.status !== 'APPROVED') {
        return {
          status: ToolStatusEnum.BLOCKED,
          reason: `Operation requires approval before execution. Current approval status: '${approval?.status ?? 'NONE'}'.`,
          evidence_refs: [],
          operation_id: op.operation_id,
          state: op.state,
        };
      }
      // Ready to execute
      this.repo.transitionOperation(op.operation_id, OperationStateEnum.READY, 'Approval confirmed; ready for execution.');
    }

    return await this.executionService.executeApproved({
      operation_id: op.operation_id,
      approver_id: user.id,
    });
  }

  /**
   * Tool 4: verify_outcome
   * Read-only reconciliation of an existing operation.
   */
  public async verifyOutcome(
    rawInput: unknown,
    context: McpContext
  ): Promise<ToolResult> {
    const input = VerifyOutcomeInputSchema.parse(rawInput);
    const op = this.repo.getOperation(input.operation_id);

    if (!op) {
      return {
        status: ToolStatusEnum.FAILED,
        reason: `Operation '${input.operation_id}' not found.`,
        evidence_refs: [],
        operation_id: input.operation_id,
      };
    }

    // If already terminal SUCCEEDED or FAILED, return current verified state
    if (op.state === OperationStateEnum.SUCCEEDED) {
      const evidence = this.repo.getEvidenceForOperation(op.operation_id);
      return {
        status: ToolStatusEnum.SUCCESS,
        reason: 'Operation is verified completed.',
        evidence_refs: evidence.map((e) => e.evidence_id),
        operation_id: op.operation_id,
        state: op.state,
        data: { operation: op },
      };
    }

    if (op.state === OperationStateEnum.FAILED) {
      const evidence = this.repo.getEvidenceForOperation(op.operation_id);
      return {
        status: ToolStatusEnum.FAILED,
        reason: 'Operation is verified failed.',
        evidence_refs: evidence.map((e) => e.evidence_id),
        operation_id: op.operation_id,
        state: op.state,
        data: { operation: op },
      };
    }

    // Active reconciliation for OUTCOME_UNKNOWN or in-flight
    const result = await this.verifier.verifyOperation(op.operation_id);

    let toolStatus: ToolStatus = ToolStatusEnum.OUTCOME_UNKNOWN;
    if (result.outcome === 'VERIFIED_SUCCESS') {
      toolStatus = ToolStatusEnum.SUCCESS;
    } else if (result.outcome === 'VERIFIED_FAILURE') {
      toolStatus = ToolStatusEnum.FAILED;
    } else {
      toolStatus = ToolStatusEnum.PAUSED_FOR_REVIEW;
    }

    const updatedOp = this.repo.getOperation(op.operation_id)!;

    return {
      status: toolStatus,
      reason: result.reason,
      evidence_refs: result.evidence_id ? [result.evidence_id] : [],
      operation_id: updatedOp.operation_id,
      state: updatedOp.state,
      data: result,
    };
  }
}
