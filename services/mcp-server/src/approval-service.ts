import {
  type AirlockRepository,
  type ApprovalRecord,
  type OperationRecord,
} from '@airlock/storage';
import {
  computeActionHash,
  OperationStateEnum,
} from '@airlock/contracts';

export class ApprovalServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApprovalServiceError';
  }
}

export class ApprovalService {
  constructor(private repo: AirlockRepository) {}

  /**
   * Initiates a human approval request bound to the cryptographic action hash (Day 3 Block 2).
   */
  public async requestApproval(params: {
    operation_id: string;
    ttlSeconds?: number;
  }): Promise<ApprovalRecord> {
    const op = this.repo.getOperation(params.operation_id);
    if (!op) {
      throw new ApprovalServiceError('NOT_FOUND', `Operation '${params.operation_id}' not found.`);
    }

    // Compute cryptographic action hash binding to the exact action parameters
    const action_hash = computeActionHash({
      operation_id: op.operation_id,
      action_type: op.action_type,
      payment_id: op.payment_id,
      amount: op.amount ?? undefined,
      provider: op.provider,
    });

    // Create approval in storage
    const approval = this.repo.createApproval({
      operation_id: op.operation_id,
      action_hash,
      requester_id: op.requester_id,
      ttlSeconds: params.ttlSeconds ?? 900, // 15 minutes default
    });

    // Move operation state to AWAITING_APPROVAL
    if (op.state !== OperationStateEnum.AWAITING_APPROVAL) {
      this.repo.transitionOperation(
        op.operation_id,
        OperationStateEnum.AWAITING_APPROVAL,
        'Action exceeds threshold; human approval requested.'
      );
    }

    return approval;
  }

  /**
   * Approves a pending action enforcing APPROVAL-002:
   * - Separation of duties: approver != requester
   * - Approver holds 'approver' role
   * - Approval not expired
   * - Approval not already consumed
   * - Stored action hash matches fresh computation of current operation
   */
  public async approve(params: {
    approval_id: string;
    approver_id: string;
    approver_roles: string[];
  }): Promise<ApprovalRecord> {
    const approval = this.getApproval(params.approval_id);
    const op = this.repo.getOperation(approval.operation_id);
    if (!op) {
      throw new ApprovalServiceError('NOT_FOUND', `Operation '${approval.operation_id}' not found.`);
    }

    // 1. Role verification
    if (!params.approver_roles.includes('approver')) {
      throw new ApprovalServiceError(
        'APPROVAL-002',
        `User '${params.approver_id}' lacks the 'approver' role.`
      );
    }

    // 2. Separation of duties (Requester cannot approve their own request)
    if (approval.requester_id === params.approver_id) {
      throw new ApprovalServiceError(
        'APPROVAL-002',
        `Self-approval forbidden (APPROVAL-002): requester '${approval.requester_id}' cannot approve their own action.`
      );
    }

    // 3. Expiry check
    if (new Date(approval.expires_at).getTime() < Date.now()) {
      throw new ApprovalServiceError('APPROVAL-002', 'Approval request has expired.');
    }

    // 4. Status check
    if (approval.status !== 'PENDING') {
      throw new ApprovalServiceError(
        'APPROVAL-002',
        `Approval is in '${approval.status}' state and cannot be approved.`
      );
    }

    // 5. Cryptographic Action Hash Integrity Check
    const currentActionHash = computeActionHash({
      operation_id: op.operation_id,
      action_type: op.action_type,
      payment_id: op.payment_id,
      amount: op.amount ?? undefined,
      provider: op.provider,
    });

    if (approval.action_hash !== currentActionHash) {
      throw new ApprovalServiceError(
        'APPROVAL-002',
        'Action hash mismatch: operation parameters changed after approval was requested.'
      );
    }

    // 6. Submit approval in storage
    const approved = this.repo.submitApproval({
      approval_id: approval.approval_id,
      approver_id: params.approver_id,
      approver_role: 'approver',
      approved: true,
    });

    // 7. Transition operation to READY
    this.repo.transitionOperation(
      op.operation_id,
      OperationStateEnum.READY,
      `Approved by '${params.approver_id}'. Action is ready for execution.`
    );

    return approved;
  }

  /**
   * Rejects an approval, moving operation to DENIED.
   */
  public async reject(params: {
    approval_id: string;
    approver_id: string;
    approver_roles: string[];
    reason?: string;
  }): Promise<ApprovalRecord> {
    const approval = this.getApproval(params.approval_id);
    const op = this.repo.getOperation(approval.operation_id);
    if (!op) {
      throw new ApprovalServiceError('NOT_FOUND', `Operation '${approval.operation_id}' not found.`);
    }

    if (!params.approver_roles.includes('approver')) {
      throw new ApprovalServiceError('APPROVAL-002', `User '${params.approver_id}' lacks the 'approver' role.`);
    }

    const rejected = this.repo.submitApproval({
      approval_id: approval.approval_id,
      approver_id: params.approver_id,
      approver_role: 'approver',
      approved: false,
    });

    this.repo.transitionOperation(
      op.operation_id,
      OperationStateEnum.DENIED,
      params.reason ?? `Rejected by approver '${params.approver_id}'.`
    );

    return rejected;
  }

  public getApproval(approval_id: string): ApprovalRecord {
    const approval = this.repo.getApprovalByOperationId(approval_id);
    // If not found by op_id, query by approval_id
    if (approval && approval.approval_id === approval_id) return approval;
    // We can also query directly
    const row = (this.repo as any).db
      .prepare('SELECT * FROM approvals WHERE approval_id = ?')
      .get(approval_id) as ApprovalRecord | undefined;
    if (!row) {
      throw new ApprovalServiceError('NOT_FOUND', `Approval '${approval_id}' not found.`);
    }
    return row;
  }

  public listPendingApprovals(): Array<{
    approval: ApprovalRecord;
    operation: OperationRecord;
  }> {
    const rows = (this.repo as any).db
      .prepare("SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC")
      .all() as ApprovalRecord[];

    const result = [];
    for (const app of rows) {
      const op = this.repo.getOperation(app.operation_id);
      if (op) {
        result.push({ approval: app, operation: op });
      }
    }
    return result;
  }
}

