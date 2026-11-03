import {
  type AirlockRepository,
  type OperationRecord,
} from '@airlock/storage';
import {
  type ProviderAdapter,
  type ToolResult,
  ToolStatusEnum,
  OperationStateEnum,
  DispositionEnum,
  type ActionRequest,
  computeActionHash,
} from '@airlock/contracts';
import {
  evaluate,
  loadPolicyFacts,
  type PolicyConfig,
  DEFAULT_POLICY_CONFIG,
} from '@airlock/policy-engine';

export class ExecutionServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ExecutionServiceError';
  }
}

export class ExecutionService {
  constructor(
    private repo: AirlockRepository,
    private adapter: ProviderAdapter,
    private config: PolicyConfig = DEFAULT_POLICY_CONFIG
  ) {}

  /**
   * Executes an approved action with pre-execution recheck (Day 3 Block 3).
   * 
   * Invariants enforced:
   * 1. Approval must be valid, APPROVED, unexpired, and unconsumed.
   * 2. Fresh Facts Recheck: Re-runs policy immediately before provider call.
   *    If anything changed (e.g. concurrent refund deducted funds), execution blocks.
   * 3. Atomic single-use approval consumption.
   * 4. Write-ahead log: operation saved as EXECUTING before calling provider.
   * 5. Outcome verification against provider response; timeouts never marked as failure.
   */
  public async executeApproved(params: {
    operation_id: string;
    approver_id: string;
  }): Promise<ToolResult> {
    const op = this.repo.getOperation(params.operation_id);
    if (!op) {
      throw new ExecutionServiceError('NOT_FOUND', `Operation '${params.operation_id}' not found.`);
    }

    if (op.state !== OperationStateEnum.READY) {
      throw new ExecutionServiceError(
        'INVALID_STATE',
        `Operation '${op.operation_id}' is in '${op.state}' state; must be 'READY' to execute.`
      );
    }

    // 1. Load approval record
    const approval = this.repo.getApprovalByOperationId(op.operation_id);
    if (!approval) {
      throw new ExecutionServiceError('NO_APPROVAL', 'No approval record found for this operation.');
    }

    if (approval.status !== 'APPROVED') {
      throw new ExecutionServiceError(
        'APPROVAL_NOT_GRANTED',
        `Approval is in '${approval.status}' state; must be 'APPROVED'.`
      );
    }

    if (new Date(approval.expires_at).getTime() < Date.now()) {
      throw new ExecutionServiceError('APPROVAL_EXPIRED', 'Approval has expired.');
    }

    // Verify Action Hash
    const expectedHash = computeActionHash({
      operation_id: op.operation_id,
      action_type: op.action_type,
      payment_id: op.payment_id,
      amount: op.amount ?? undefined,
      provider: op.provider,
    });

    if (approval.action_hash !== expectedHash) {
      throw new ExecutionServiceError('HASH_MISMATCH', 'Approval action hash does not match current operation.');
    }

    // 2. Pre-Execution Recheck (Core Safety Principle 7: Current state beats stale context)
    const actionRequest: ActionRequest = {
      request_id: op.request_id,
      action_type: 'REFUND',
      payment_id: op.payment_id,
      amount: op.amount ?? undefined,
      reason: op.reason,
      requester_id: op.requester_id,
    };

    const freshFacts = await loadPolicyFacts({
      caller_id: op.requester_id,
      payment_id: op.payment_id,
      repository: this.repo,
      adapter: this.adapter,
      config: this.config,
    });

    const recheckResult = evaluate(actionRequest, freshFacts, this.config);

    if (recheckResult.disposition !== DispositionEnum.ALLOW && recheckResult.disposition !== DispositionEnum.REQUIRE_APPROVAL) {
      // Recheck failed! State has changed (e.g. balance was drained concurrently)
      const blockReason = `Pre-execution recheck blocked execution [${recheckResult.ruleIds.join(', ')}]: ${recheckResult.reasons.join('; ')}`;
      this.repo.transitionOperation(op.operation_id, OperationStateEnum.DENIED, blockReason);

      this.repo.appendAuditLog({
        operation_id: op.operation_id,
        event_type: 'PRECHECK_FAILED',
        details: { reasons: recheckResult.reasons, ruleIds: recheckResult.ruleIds },
      });

      return {
        status: ToolStatusEnum.BLOCKED,
        reason: blockReason,
        evidence_refs: [],
        operation_id: op.operation_id,
        state: OperationStateEnum.DENIED,
        disposition: recheckResult.disposition,
      };
    }

    // 3. Atomic Consume Approval
    this.repo.consumeApproval(approval.approval_id);

    // 4. Write-Ahead Record: Persist as EXECUTING before provider call
    this.repo.transitionOperation(
      op.operation_id,
      OperationStateEnum.EXECUTING,
      'Precheck passed; intent recorded in write-ahead log.'
    );

    // 5. Execute Provider Adapter
    try {
      const refundResult = await this.adapter.refund({
        operation_id: op.operation_id,
        provider_idempotency_key: op.provider_idempotency_key,
        capture_id: op.payment_id,
        amount: op.amount ?? undefined,
        reason: op.reason,
      });

      if (refundResult.status === 'COMPLETED') {
        const evidence = this.repo.recordEvidence({
          operation_id: op.operation_id,
          evidence_type: 'provider_response',
          provider_reference: refundResult.provider_refund_id,
          observed_status: refundResult.status,
          outcome: 'VERIFIED_SUCCESS',
          data: refundResult.raw_response,
        });

        this.repo.transitionOperation(
          op.operation_id,
          OperationStateEnum.SUCCEEDED,
          'Provider confirmed refund execution.',
          refundResult.provider_refund_id
        );

        return {
          status: ToolStatusEnum.SUCCESS,
          reason: 'Refund executed and verified against provider.',
          evidence_refs: [evidence.evidence_id],
          operation_id: op.operation_id,
          state: OperationStateEnum.SUCCEEDED,
          disposition: DispositionEnum.ALLOW,
          data: {
            refund_id: refundResult.provider_refund_id,
            amount: refundResult.amount,
          },
        };
      } else {
        const evidence = this.repo.recordEvidence({
          operation_id: op.operation_id,
          evidence_type: 'provider_response',
          provider_reference: refundResult.provider_refund_id,
          observed_status: refundResult.status,
          outcome: 'VERIFIED_FAILURE',
          data: refundResult.raw_response,
        });

        this.repo.transitionOperation(
          op.operation_id,
          OperationStateEnum.FAILED,
          `Provider reported refund status '${refundResult.status}'.`
        );

        return {
          status: ToolStatusEnum.FAILED,
          reason: `Provider reported non-success status: ${refundResult.status}`,
          evidence_refs: [evidence.evidence_id],
          operation_id: op.operation_id,
          state: OperationStateEnum.FAILED,
        };
      }
    } catch (error) {
      // Network timeout / lost response mid-call
      // NEVER classify as failure! Move to OUTCOME_UNKNOWN!
      const evidence = this.repo.recordEvidence({
        operation_id: op.operation_id,
        evidence_type: 'provider_timeout',
        observed_status: 'TIMEOUT',
        outcome: 'UNRESOLVED',
        data: { error: error instanceof Error ? error.message : String(error) },
      });

      this.repo.transitionOperation(
        op.operation_id,
        OperationStateEnum.OUTCOME_UNKNOWN,
        `Provider call timed out or disconnected: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        status: ToolStatusEnum.OUTCOME_UNKNOWN,
        reason: 'Provider connection lost mid-call. Operation marked OUTCOME_UNKNOWN. Verification required; blind retry forbidden.',
        evidence_refs: [evidence.evidence_id],
        operation_id: op.operation_id,
        state: OperationStateEnum.OUTCOME_UNKNOWN,
      };
    }
  }
}
