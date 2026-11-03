import type Database from 'better-sqlite3';
import {
  type OperationState,
  transition,
  type Money,
  fromMinor,
  type Disposition,
  type JevSignals,
  type JevStatus,
} from '@airlock/contracts';
import { randomUUID } from 'node:crypto';

export interface OperationRecord {
  operation_id: string;
  request_id: string;
  params_fingerprint: string;
  provider: string;
  provider_idempotency_key: string;
  provider_operation_id: string | null;
  action_type: string;
  payment_id: string;
  amount: Money | null;
  reason: string;
  requester_id: string;
  state: OperationState;
  created_at: string;
  updated_at: string;
}

export interface DecisionRecord {
  decision_id: string;
  operation_id: string;
  jev_status: JevStatus;
  jev_signals: JevSignals | null;
  policy_result: Disposition;
  policy_rule_ids: string[];
  policy_reason: string;
  final_disposition: Disposition;
  created_at: string;
}

export interface ApprovalRecord {
  approval_id: string;
  operation_id: string;
  action_hash: string;
  requester_id: string;
  approver_id: string | null;
  approver_role: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CONSUMED';
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface EvidenceRecord {
  evidence_id: string;
  operation_id: string;
  evidence_type: string;
  provider_reference: string | null;
  observed_status: string;
  outcome: 'VERIFIED_SUCCESS' | 'VERIFIED_FAILURE' | 'UNRESOLVED';
  mismatch_flags: string[];
  data: unknown;
  created_at: string;
}

export class IdempotencyConflictError extends Error {
  constructor(requestId: string) {
    super(`Idempotency conflict (IDEMP-002): request_id '${requestId}' already exists with different parameters.`);
    this.name = 'IdempotencyConflictError';
  }
}

export class AirlockRepository {
  constructor(private db: Database.Database) {}

  /**
   * Intakes an operation with strict idempotency (IDEMP-001 & IDEMP-002).
   */
  createOrGetOperation(params: {
    request_id: string;
    params_fingerprint: string;
    provider: string;
    action_type: string;
    payment_id: string;
    amount?: Money;
    reason: string;
    requester_id: string;
  }): { operation: OperationRecord; isNew: boolean } {
    const existing = this.getOperationByRequestId(params.request_id);

    if (existing) {
      if (existing.params_fingerprint !== params.params_fingerprint) {
        throw new IdempotencyConflictError(params.request_id);
      }
      return { operation: existing, isNew: false };
    }

    const now = new Date().toISOString();
    const operation_id = randomUUID();
    // Deterministic provider idempotency key derived from operation_id
    const provider_idempotency_key = `idemp_${operation_id.replace(/-/g, '').slice(0, 24)}`;

    const stmt = this.db.prepare(`
      INSERT INTO operations (
        operation_id, request_id, params_fingerprint, provider, provider_idempotency_key,
        provider_operation_id, action_type, payment_id, amount_minor, currency, reason,
        requester_id, state, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      operation_id,
      params.request_id,
      params.params_fingerprint,
      params.provider,
      provider_idempotency_key,
      null,
      params.action_type,
      params.payment_id,
      params.amount?.amount_minor ?? null,
      params.amount?.currency ?? null,
      params.reason,
      params.requester_id,
      'RECEIVED',
      now,
      now
    );

    this.appendAuditLog({
      operation_id,
      event_type: 'OPERATION_CREATED',
      from_state: null,
      to_state: 'RECEIVED',
      details: { request_id: params.request_id, payment_id: params.payment_id },
    });

    const created = this.getOperation(operation_id)!;
    return { operation: created, isNew: true };
  }

  getOperation(operation_id: string): OperationRecord | null {
    const row = this.db.prepare('SELECT * FROM operations WHERE operation_id = ?').get(operation_id) as any;
    if (!row) return null;
    return this.mapOperationRow(row);
  }

  getOperationByRequestId(request_id: string): OperationRecord | null {
    const row = this.db.prepare('SELECT * FROM operations WHERE request_id = ?').get(request_id) as any;
    if (!row) return null;
    return this.mapOperationRow(row);
  }

  /**
   * Transitions an operation through the guarded state machine.
   * Throws IllegalStateTransitionError if the transition is forbidden.
   */
  transitionOperation(
    operation_id: string,
    toState: OperationState,
    context?: string,
    providerOperationId?: string
  ): OperationRecord {
    const op = this.getOperation(operation_id);
    if (!op) {
      throw new Error(`Operation '${operation_id}' not found`);
    }

    const nextState = transition(op.state, toState, context);
    const now = new Date().toISOString();

    if (providerOperationId) {
      this.db.prepare(`
        UPDATE operations 
        SET state = ?, updated_at = ?, provider_operation_id = ? 
        WHERE operation_id = ?
      `).run(nextState, now, providerOperationId, operation_id);
    } else {
      this.db.prepare(`
        UPDATE operations 
        SET state = ?, updated_at = ? 
        WHERE operation_id = ?
      `).run(nextState, now, operation_id);
    }

    this.appendAuditLog({
      operation_id,
      event_type: 'STATE_TRANSITION',
      from_state: op.state,
      to_state: nextState,
      details: { context, providerOperationId },
    });

    return this.getOperation(operation_id)!;
  }

  getAuditLogsForOperation(operation_id: string): any[] {
    return this.db.prepare('SELECT * FROM audit_log WHERE operation_id = ? ORDER BY audit_id ASC').all(operation_id);
  }

  /**
   * Persists a decision record for an operation.
   */
  recordDecision(params: {
    operation_id: string;
    jev_status: JevStatus;
    jev_signals?: JevSignals;
    policy_result: Disposition;
    policy_rule_ids: string[];
    policy_reason: string;
    final_disposition: Disposition;
  }): DecisionRecord {
    const decision_id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO decisions (
        decision_id, operation_id, jev_status, jev_signals, policy_result,
        policy_rule_ids, policy_reason, final_disposition, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decision_id,
      params.operation_id,
      params.jev_status,
      params.jev_signals ? JSON.stringify(params.jev_signals) : null,
      params.policy_result,
      JSON.stringify(params.policy_rule_ids),
      params.policy_reason,
      params.final_disposition,
      now
    );

    this.appendAuditLog({
      operation_id: params.operation_id,
      event_type: 'DECISION_RECORDED',
      details: {
        decision_id,
        final_disposition: params.final_disposition,
        policy_rule_ids: params.policy_rule_ids,
      },
    });

    return {
      decision_id,
      operation_id: params.operation_id,
      jev_status: params.jev_status,
      jev_signals: params.jev_signals ?? null,
      policy_result: params.policy_result,
      policy_rule_ids: params.policy_rule_ids,
      policy_reason: params.policy_reason,
      final_disposition: params.final_disposition,
      created_at: now,
    };
  }

  getDecisionByOperationId(operation_id: string): DecisionRecord | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE operation_id = ? ORDER BY created_at DESC LIMIT 1').get(operation_id) as any;
    if (!row) return null;
    return {
      decision_id: row.decision_id,
      operation_id: row.operation_id,
      jev_status: row.jev_status,
      jev_signals: row.jev_signals ? JSON.parse(row.jev_signals) : null,
      policy_result: row.policy_result,
      policy_rule_ids: JSON.parse(row.policy_rule_ids),
      policy_reason: row.policy_reason,
      final_disposition: row.final_disposition,
      created_at: row.created_at,
    };
  }

  /**
   * Creates an approval request bound to an action hash.
   */
  createApproval(params: {
    operation_id: string;
    action_hash: string;
    requester_id: string;
    ttlSeconds?: number;
  }): ApprovalRecord {
    const approval_id = randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + (params.ttlSeconds ?? 900) * 1000); // default 15 min

    this.db.prepare(`
      INSERT INTO approvals (
        approval_id, operation_id, action_hash, requester_id, approver_id,
        approver_role, status, expires_at, consumed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approval_id,
      params.operation_id,
      params.action_hash,
      params.requester_id,
      null,
      null,
      'PENDING',
      expires.toISOString(),
      null,
      now.toISOString()
    );

    this.appendAuditLog({
      operation_id: params.operation_id,
      event_type: 'APPROVAL_REQUESTED',
      details: { approval_id, action_hash: params.action_hash },
    });

    return {
      approval_id,
      operation_id: params.operation_id,
      action_hash: params.action_hash,
      requester_id: params.requester_id,
      approver_id: null,
      approver_role: null,
      status: 'PENDING',
      expires_at: expires.toISOString(),
      consumed_at: null,
      created_at: now.toISOString(),
    };
  }

  getApproval(approval_id: string): ApprovalRecord | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(approval_id) as any;
    if (!row) return null;
    return {
      approval_id: row.approval_id,
      operation_id: row.operation_id,
      action_hash: row.action_hash,
      requester_id: row.requester_id,
      approver_id: row.approver_id,
      approver_role: row.approver_role,
      status: row.status,
      expires_at: row.expires_at,
      consumed_at: row.consumed_at,
      created_at: row.created_at,
    };
  }

  getApprovalByOperationId(operation_id: string): ApprovalRecord | null {
    const row = this.db.prepare('SELECT * FROM approvals WHERE operation_id = ? ORDER BY created_at DESC LIMIT 1').get(operation_id) as any;
    if (!row) return null;
    return {
      approval_id: row.approval_id,
      operation_id: row.operation_id,
      action_hash: row.action_hash,
      requester_id: row.requester_id,
      approver_id: row.approver_id,
      approver_role: row.approver_role,
      status: row.status,
      expires_at: row.expires_at,
      consumed_at: row.consumed_at,
      created_at: row.created_at,
    };
  }

  /**
   * Approves an action if separation of duties passes (approver != requester).
   */
  submitApproval(params: {
    approval_id: string;
    approver_id: string;
    approver_role: string;
    approved: boolean;
  }): ApprovalRecord {
    const row = this.db.prepare('SELECT * FROM approvals WHERE approval_id = ?').get(params.approval_id) as any;
    if (!row) throw new Error(`Approval '${params.approval_id}' not found`);

    if (row.requester_id === params.approver_id) {
      throw new Error('Self-approval forbidden (APPROVAL-002): requester cannot approve their own action.');
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.db.prepare("UPDATE approvals SET status = 'EXPIRED' WHERE approval_id = ?").run(params.approval_id);
      throw new Error('Approval has expired.');
    }

    const newStatus = params.approved ? 'APPROVED' : 'REJECTED';
    this.db.prepare(`
      UPDATE approvals 
      SET status = ?, approver_id = ?, approver_role = ?
      WHERE approval_id = ?
    `).run(newStatus, params.approver_id, params.approver_role, params.approval_id);

    this.appendAuditLog({
      operation_id: row.operation_id,
      event_type: params.approved ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
      details: { approver_id: params.approver_id, approver_role: params.approver_role },
    });

    return {
      ...row,
      status: newStatus,
      approver_id: params.approver_id,
      approver_role: params.approver_role,
    };
  }

  /**
   * Consumes an approved action atomically.
   */
  consumeApproval(approval_id: string): void {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE approvals 
      SET status = 'CONSUMED', consumed_at = ?
      WHERE approval_id = ? AND status = 'APPROVED'
    `).run(now, approval_id);

    if (result.changes === 0) {
      throw new Error(`Cannot consume approval '${approval_id}': not in APPROVED state.`);
    }
  }

  /**
   * Records provider evidence.
   */
  recordEvidence(params: {
    operation_id: string;
    evidence_type: string;
    provider_reference?: string;
    observed_status: string;
    outcome: 'VERIFIED_SUCCESS' | 'VERIFIED_FAILURE' | 'UNRESOLVED';
    mismatch_flags?: string[];
    data?: unknown;
  }): EvidenceRecord {
    const evidence_id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO evidence (
        evidence_id, operation_id, evidence_type, provider_reference,
        observed_status, outcome, mismatch_flags, data, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evidence_id,
      params.operation_id,
      params.evidence_type,
      params.provider_reference ?? null,
      params.observed_status,
      params.outcome,
      params.mismatch_flags ? JSON.stringify(params.mismatch_flags) : null,
      params.data ? JSON.stringify(params.data) : null,
      now
    );

    this.appendAuditLog({
      operation_id: params.operation_id,
      event_type: 'EVIDENCE_RECORDED',
      details: {
        evidence_id,
        evidence_type: params.evidence_type,
        outcome: params.outcome,
      },
    });

    return {
      evidence_id,
      operation_id: params.operation_id,
      evidence_type: params.evidence_type,
      provider_reference: params.provider_reference ?? null,
      observed_status: params.observed_status,
      outcome: params.outcome,
      mismatch_flags: params.mismatch_flags ?? [],
      data: params.data,
      created_at: now,
    };
  }

  getEvidenceForOperation(operation_id: string): EvidenceRecord[] {
    const rows = this.db.prepare('SELECT * FROM evidence WHERE operation_id = ? ORDER BY created_at ASC').all(operation_id) as any[];
    return rows.map((row) => ({
      evidence_id: row.evidence_id,
      operation_id: row.operation_id,
      evidence_type: row.evidence_type,
      provider_reference: row.provider_reference,
      observed_status: row.observed_status,
      outcome: row.outcome,
      mismatch_flags: row.mismatch_flags ? JSON.parse(row.mismatch_flags) : [],
      data: row.data ? JSON.parse(row.data) : null,
      created_at: row.created_at,
    }));
  }

  /**
   * Append-only audit logger.
   */
  appendAuditLog(params: {
    operation_id: string;
    event_type: string;
    from_state?: string | null;
    to_state?: string | null;
    details?: unknown;
  }): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO audit_log (
        operation_id, event_type, from_state, to_state, details, prev_hash, row_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)
    `).run(
      params.operation_id,
      params.event_type,
      params.from_state ?? null,
      params.to_state ?? null,
      params.details ? JSON.stringify(params.details) : null,
      now
    );
  }

  /**
   * Lists completed and in-flight operations for a payment to compute cumulative totals.
   */
  listOperationsForPayment(payment_id: string): OperationRecord[] {
    const rows = this.db.prepare('SELECT * FROM operations WHERE payment_id = ?').all(payment_id) as any[];
    return rows.map((r) => this.mapOperationRow(r));
  }

  /**
   * Counts operations requested by a caller within a rolling time window (for VELOCITY-001).
   */
  countRecentOperationsForRequester(requester_id: string, windowSeconds: number): number {
    const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM operations 
      WHERE requester_id = ? AND created_at >= ?
    `).get(requester_id, cutoff) as { count: number };
    return result.count;
  }

  private mapOperationRow(row: any): OperationRecord {
    return {
      operation_id: row.operation_id,
      request_id: row.request_id,
      params_fingerprint: row.params_fingerprint,
      provider: row.provider,
      provider_idempotency_key: row.provider_idempotency_key,
      provider_operation_id: row.provider_operation_id,
      action_type: row.action_type,
      payment_id: row.payment_id,
      amount: row.amount_minor != null && row.currency ? fromMinor(row.amount_minor, row.currency) : null,
      reason: row.reason,
      requester_id: row.requester_id,
      state: row.state as OperationState,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

