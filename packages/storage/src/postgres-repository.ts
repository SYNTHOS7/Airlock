import { Pool } from 'pg';
import {
  type OperationRecord,
  type DecisionRecord,
  type ApprovalRecord,
  type EvidenceRecord,
  IdempotencyConflictError,
} from './repository.js';
import {
  type OperationState,
  transition,
  fromMinor,
  type Money,
  type Disposition,
  type JevSignals,
  type JevStatus,
} from '@airlock/contracts';
import { randomUUID } from 'node:crypto';

export class PostgresRepository {
  private pool: Pool;

  constructor(connectionStringOrPool: string | Pool) {
    if (typeof connectionStringOrPool === 'string') {
      this.pool = new Pool({
        connectionString: connectionStringOrPool,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
      });
    } else {
      this.pool = connectionStringOrPool;
    }
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Intakes an operation with strict idempotency (IDEMP-001 & IDEMP-002).
   */
  async createOrGetOperation(params: {
    request_id: string;
    params_fingerprint: string;
    provider: string;
    action_type: string;
    payment_id: string;
    amount?: Money;
    reason: string;
    requester_id: string;
  }): Promise<{ operation: OperationRecord; isNew: boolean }> {
    const existing = await this.getOperationByRequestId(params.request_id);

    if (existing) {
      if (existing.params_fingerprint !== params.params_fingerprint) {
        throw new IdempotencyConflictError(params.request_id);
      }
      return { operation: existing, isNew: false };
    }

    const now = new Date().toISOString();
    const operation_id = randomUUID();
    const provider_idempotency_key = `idemp_${operation_id.replace(/-/g, '').slice(0, 24)}`;

    const q = `
      INSERT INTO operations (
        operation_id, request_id, params_fingerprint, provider, provider_idempotency_key,
        provider_operation_id, action_type, payment_id, amount_minor, currency, reason,
        requester_id, state, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      operation_id,
      params.request_id,
      params.params_fingerprint,
      params.provider,
      provider_idempotency_key,
      null,
      params.action_type,
      params.payment_id,
      params.amount ? params.amount.amount_minor : null,
      params.amount ? params.amount.currency : 'USD',
      params.reason,
      params.requester_id,
      'RECEIVED',
      now,
      now,
    ];

    try {
      const res = await this.pool.query(q, values);
      const op = this.mapOperationRow(res.rows[0]);

      await this.appendAuditLog({
        operation_id: op.operation_id,
        event_type: 'INTAKE',
        to_state: 'RECEIVED',
        actor_id: params.requester_id,
        actor_role: 'support_agent',
        details: { request_id: params.request_id, provider: params.provider },
      });

      return { operation: op, isNew: true };
    } catch (err: any) {
      // Race condition / unique constraint catch
      const raced = await this.getOperationByRequestId(params.request_id);
      if (raced) {
        if (raced.params_fingerprint !== params.params_fingerprint) {
          throw new IdempotencyConflictError(params.request_id);
        }
        return { operation: raced, isNew: false };
      }
      throw err;
    }
  }

  async getOperation(operation_id: string): Promise<OperationRecord | null> {
    const res = await this.pool.query('SELECT * FROM operations WHERE operation_id = $1', [operation_id]);
    if (res.rows.length === 0) return null;
    return this.mapOperationRow(res.rows[0]);
  }

  async getOperationByRequestId(request_id: string): Promise<OperationRecord | null> {
    const res = await this.pool.query('SELECT * FROM operations WHERE request_id = $1', [request_id]);
    if (res.rows.length === 0) return null;
    return this.mapOperationRow(res.rows[0]);
  }

  async transitionOperation(
    operation_id: string,
    toState: OperationState,
    context?: string,
    providerOperationId?: string
  ): Promise<OperationRecord> {
    const op = await this.getOperation(operation_id);
    if (!op) {
      throw new Error(`Operation '${operation_id}' not found`);
    }

    const validatedState = transition(op.state, toState, context);
    const now = new Date().toISOString();

    let q: string;
    let values: any[];

    if (providerOperationId) {
      q = `
        UPDATE operations
        SET state = $1, updated_at = $2, provider_operation_id = $3
        WHERE operation_id = $4
        RETURNING *
      `;
      values = [validatedState, now, providerOperationId, operation_id];
    } else {
      q = `
        UPDATE operations
        SET state = $1, updated_at = $2
        WHERE operation_id = $3
        RETURNING *
      `;
      values = [validatedState, now, operation_id];
    }

    const res = await this.pool.query(q, values);
    const updated = this.mapOperationRow(res.rows[0]);

    await this.appendAuditLog({
      operation_id,
      event_type: 'STATE_TRANSITION',
      from_state: op.state,
      to_state: validatedState,
      actor_id: 'system',
      actor_role: 'system',
      details: { context, providerOperationId },
    });

    return updated;
  }

  async getAuditLogsForOperation(operation_id: string): Promise<any[]> {
    const res = await this.pool.query(
      'SELECT * FROM audit_log WHERE operation_id = $1 ORDER BY created_at ASC',
      [operation_id]
    );
    return res.rows.map(this.mapAuditLogRow);
  }

  async recordDecision(params: {
    operation_id: string;
    jev_status: JevStatus;
    jev_signals: JevSignals | null;
    policy_result: Disposition;
    policy_rule_ids: string[];
    policy_reason: string;
    final_disposition: Disposition;
  }): Promise<DecisionRecord> {
    const decision_id = randomUUID();
    const now = new Date().toISOString();

    const q = `
      INSERT INTO decisions (
        decision_id, operation_id, jev_status, jev_signals, policy_result,
        policy_rule_ids, policy_reason, final_disposition, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      decision_id,
      params.operation_id,
      params.jev_status,
      params.jev_signals ? JSON.stringify(params.jev_signals) : null,
      params.policy_result,
      JSON.stringify(params.policy_rule_ids),
      params.policy_reason,
      params.final_disposition,
      now,
    ];

    const res = await this.pool.query(q, values);
    return this.mapDecisionRow(res.rows[0]);
  }

  async getDecisionByOperationId(operation_id: string): Promise<DecisionRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM decisions WHERE operation_id = $1 ORDER BY created_at DESC LIMIT 1',
      [operation_id]
    );
    if (res.rows.length === 0) return null;
    return this.mapDecisionRow(res.rows[0]);
  }

  async createApproval(params: {
    operation_id: string;
    action_hash: string;
    requester_id: string;
    action_snapshot?: unknown;
    expires_in_seconds?: number;
  }): Promise<ApprovalRecord> {
    const approval_id = `appr_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date();
    const created_at = now.toISOString();
    const ttlSeconds = params.expires_in_seconds || 86400; // 24hr default
    const expires_at = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    const q = `
      INSERT INTO approvals (
        approval_id, operation_id, action_hash, requester_id, status,
        action_snapshot, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      approval_id,
      params.operation_id,
      params.action_hash,
      params.requester_id,
      'PENDING',
      JSON.stringify(params.action_snapshot || {}),
      created_at,
      expires_at,
    ];

    const res = await this.pool.query(q, values);
    return this.mapApprovalRow(res.rows[0]);
  }

  async getApproval(approval_id: string): Promise<ApprovalRecord | null> {
    const res = await this.pool.query('SELECT * FROM approvals WHERE approval_id = $1', [approval_id]);
    if (res.rows.length === 0) return null;
    return this.mapApprovalRow(res.rows[0]);
  }

  async getApprovalByOperationId(operation_id: string): Promise<ApprovalRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM approvals WHERE operation_id = $1 ORDER BY created_at DESC LIMIT 1',
      [operation_id]
    );
    if (res.rows.length === 0) return null;
    return this.mapApprovalRow(res.rows[0]);
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM approvals WHERE status = 'PENDING' ORDER BY created_at DESC"
    );
    return res.rows.map(this.mapApprovalRow);
  }

  async submitApproval(params: {
    approval_id: string;
    approver_id: string;
    approver_role: string;
    action: 'APPROVE' | 'REJECT';
    reason?: string;
  }): Promise<ApprovalRecord> {
    const approval = await this.getApproval(params.approval_id);
    if (!approval) throw new Error(`Approval '${params.approval_id}' not found`);

    if (approval.requester_id === params.approver_id) {
      throw new Error(`Self-approval forbidden (APPROVAL-002): requester '${approval.requester_id}' cannot approve own request.`);
    }

    if (new Date(approval.expires_at).getTime() < Date.now()) {
      await this.pool.query("UPDATE approvals SET status = 'EXPIRED' WHERE approval_id = $1", [params.approval_id]);
      throw new Error(`Approval '${params.approval_id}' has expired.`);
    }

    const newStatus = params.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const now = new Date().toISOString();

    const q = `
      UPDATE approvals
      SET status = $1, approver_id = $2, approver_role = $3, decided_at = $4, rejection_reason = $5
      WHERE approval_id = $6 AND status = 'PENDING'
      RETURNING *
    `;

    const values = [newStatus, params.approver_id, params.approver_role, now, params.reason || null, params.approval_id];
    const res = await this.pool.query(q, values);
    if (res.rows.length === 0) {
      throw new Error(`Approval '${params.approval_id}' was already decided or expired.`);
    }

    return this.mapApprovalRow(res.rows[0]);
  }

  async consumeApproval(approval_id: string): Promise<void> {
    const now = new Date().toISOString();
    const q = `
      UPDATE approvals
      SET status = 'CONSUMED', consumed_at = $1
      WHERE approval_id = $2 AND status = 'APPROVED'
    `;
    const res = await this.pool.query(q, [now, approval_id]);
    if (res.rowCount === 0) {
      throw new Error(`Cannot consume approval '${approval_id}': not in APPROVED state.`);
    }
  }

  async recordEvidence(params: {
    operation_id: string;
    evidence_type: string;
    observed_status: string;
    outcome?: 'VERIFIED_SUCCESS' | 'VERIFIED_FAILURE' | 'UNRESOLVED';
    provider_reference?: string;
    mismatch_flags?: string[];
    data?: unknown;
  }): Promise<EvidenceRecord> {
    const evidence_id = `ev_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const q = `
      INSERT INTO evidence (
        evidence_id, operation_id, evidence_type, provider_reference, observed_status,
        outcome, mismatch_flags, data, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      evidence_id,
      params.operation_id,
      params.evidence_type,
      params.provider_reference || null,
      params.observed_status,
      params.outcome || 'UNRESOLVED',
      JSON.stringify(params.mismatch_flags || []),
      JSON.stringify(params.data || {}),
      now,
    ];

    const res = await this.pool.query(q, values);
    return this.mapEvidenceRow(res.rows[0]);
  }

  async getEvidenceForOperation(operation_id: string): Promise<EvidenceRecord[]> {
    const res = await this.pool.query(
      'SELECT * FROM evidence WHERE operation_id = $1 ORDER BY created_at ASC',
      [operation_id]
    );
    return res.rows.map(this.mapEvidenceRow);
  }

  async appendAuditLog(params: {
    operation_id: string;
    event_type: string;
    from_state?: string;
    to_state?: string;
    actor_id?: string;
    actor_role?: string;
    details?: unknown;
  }): Promise<void> {
    const audit_id = `aud_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const q = `
      INSERT INTO audit_log (
        audit_id, operation_id, event_type, from_state, to_state,
        actor_id, actor_role, details, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    const values = [
      audit_id,
      params.operation_id,
      params.event_type,
      params.from_state || null,
      params.to_state || null,
      params.actor_id || 'system',
      params.actor_role || 'system',
      JSON.stringify(params.details || {}),
      now,
    ];

    await this.pool.query(q, values);
  }

  async listOperationsForPayment(payment_id: string): Promise<OperationRecord[]> {
    const res = await this.pool.query(
      'SELECT * FROM operations WHERE payment_id = $1 ORDER BY created_at ASC',
      [payment_id]
    );
    return res.rows.map(this.mapOperationRow);
  }

  async listRecentOperations(limit = 50): Promise<OperationRecord[]> {
    const res = await this.pool.query(
      'SELECT * FROM operations ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return res.rows.map(this.mapOperationRow);
  }

  async listRecentAuditLogs(limit = 100): Promise<any[]> {
    const res = await this.pool.query(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return res.rows.map(this.mapAuditLogRow);
  }

  async countRecentOperationsForRequester(
    requester_id: string,
    windowSeconds: number,
    excludeOperationId?: string
  ): Promise<number> {
    const cutoff = new Date(Date.now() - windowSeconds * 1000).toISOString();
    let q = `
      SELECT COUNT(*) as count FROM operations
      WHERE requester_id = $1 AND created_at >= $2
    `;
    const values: any[] = [requester_id, cutoff];

    if (excludeOperationId) {
      q += ' AND operation_id != $3';
      values.push(excludeOperationId);
    }

    const res = await this.pool.query(q, values);
    return parseInt(res.rows[0].count, 10);
  }

  // ── Row Mappers ─────────────────────────────────────────────────────────────

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
      amount: row.amount_minor != null ? fromMinor(Number(row.amount_minor), row.currency || 'USD') : null,
      reason: row.reason,
      requester_id: row.requester_id,
      state: row.state as OperationState,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  private mapDecisionRow(row: any): DecisionRecord {
    return {
      decision_id: row.decision_id,
      operation_id: row.operation_id,
      jev_status: row.jev_status as JevStatus,
      jev_signals: typeof row.jev_signals === 'string' ? JSON.parse(row.jev_signals) : row.jev_signals,
      policy_result: row.policy_result as Disposition,
      policy_rule_ids: typeof row.policy_rule_ids === 'string' ? JSON.parse(row.policy_rule_ids) : row.policy_rule_ids,
      policy_reason: row.policy_reason,
      final_disposition: row.final_disposition as Disposition,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapApprovalRow(row: any): ApprovalRecord {
    return {
      approval_id: row.approval_id,
      operation_id: row.operation_id,
      action_hash: row.action_hash,
      requester_id: row.requester_id,
      approver_id: row.approver_id,
      approver_role: row.approver_role,
      status: row.status,
      expires_at: new Date(row.expires_at).toISOString(),
      consumed_at: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapEvidenceRow(row: any): EvidenceRecord {
    return {
      evidence_id: row.evidence_id,
      operation_id: row.operation_id,
      evidence_type: row.evidence_type,
      provider_reference: row.provider_reference,
      observed_status: row.observed_status,
      outcome: row.outcome,
      mismatch_flags: typeof row.mismatch_flags === 'string' ? JSON.parse(row.mismatch_flags) : (row.mismatch_flags || []),
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  private mapAuditLogRow(row: any): any {
    return {
      ...row,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}

