/**
 * Database schema definition for SQLite and PostgreSQL (Supabase ready).
 * Corresponds to Spec Part II Section 13: Data Model.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  params_fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_idempotency_key TEXT NOT NULL,
  provider_operation_id TEXT,
  action_type TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  amount_minor INTEGER,
  currency TEXT,
  reason TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operations_request_id ON operations(request_id);
CREATE INDEX IF NOT EXISTS idx_operations_payment_id ON operations(payment_id);
CREATE INDEX IF NOT EXISTS idx_operations_state ON operations(state);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  jev_status TEXT NOT NULL,
  jev_signals TEXT,
  policy_result TEXT NOT NULL,
  policy_rule_ids TEXT NOT NULL,
  policy_reason TEXT NOT NULL,
  final_disposition TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_operation_id ON decisions(operation_id);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  approver_id TEXT,
  approver_role TEXT,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_operation_id ON approvals(operation_id);
CREATE INDEX IF NOT EXISTS idx_approvals_action_hash ON approvals(action_hash);

CREATE TABLE IF NOT EXISTS evidence (
  evidence_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  provider_reference TEXT,
  observed_status TEXT NOT NULL,
  outcome TEXT NOT NULL,
  mismatch_flags TEXT,
  data TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_id) REFERENCES operations(operation_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_operation_id ON evidence(operation_id);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  details TEXT,
  prev_hash TEXT,
  row_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_operation_id ON audit_log(operation_id);
`;

