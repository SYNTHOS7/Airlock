# Airlock --- Architecture and System Decisions

## Hackathon Reference and Rules

- **Project Name:** Airlock (v2 safety & outcome-verification layer)
- **Track/Target:** PayPal AI Hackathon
- **Submission Requirements:**
  - Public GitHub repository with OSI-approved license (Apache 2.0).
  - Clean `.env.example` with variable names only (no secrets committed).
  - Video length: Strict limit of **under 3 minutes** (180 seconds).
  - Transparent labeling of any simulated/fault-injected behavior.
  - End-to-end demonstrable slice: PayPal Sandbox capture refund + verification + unknown-outcome recovery.

---

## Locked Architectural Decisions

### 1. Consequential Operation
- **Decision:** Full or partial refund of a previously captured PayPal payment (`POST /v2/payments/captures/{capture_id}/refund`).
- **Rationale:** Captures and refunds represent the primary point of risk in transactional AI agent workflows where duplicate execution or malicious prompting directly causes financial loss.

### 2. Lost-Response & Verification Strategy
- **Decision:** 
  1. Persist the operation as `EXECUTING` in SQLite *prior* to calling the provider (write-ahead log).
  2. If the network call times out, connection drops, or the process crashes: state transitions to `OUTCOME_UNKNOWN`.
  3. Reconcile by querying provider state:
     - First, query `GET /v2/payments/captures/{capture_id}` to check capture status, `refunded_amount`, and linked refunds.
     - Second, replay the refund request using the identical `PayPal-Request-Id` idempotency header and payload.
  4. If the provider confirms an existing refund whose `custom_id` matches our `operation_id`, verify as `SUCCEEDED`.
  5. If the provider indicates the refund was never created and the capture is intact, verify as `FAILED`.
  6. If provider queries are inconclusive or ambiguous, escalate to `NEEDS_REVIEW`.
  7. **Rule:** NEVER perform a blind retry with a new idempotency key.

### 3. Identity and Roles (Separation of Duties)
- **Roles:**
  - `support_agent`: Authenticated agent or user allowed to initiate/request actions.
  - `approver`: Human authorized to approve actions above thresholds.
  - `viewer`: Read-only audit and dashboard observer.
- **Enforcement:**
  - Approver must hold the `approver` role.
  - `requester_id != approver_id` is strictly enforced (`APPROVAL-002`). Self-approval is rejected.
  - Approval is bound to the cryptographic hash of the exact action payload (`action_hash`), expires after a fixed TTL (default: 15 minutes), and is single-use (atomically consumed).

### 4. Monetary Representation
- **Decision:** All financial quantities are modeled as integer minor units (`amount_minor`) alongside an ISO 4217 uppercase currency string (`currency`).
- **Rationale:** Floating-point numbers introduce IEEE-754 precision errors that can lead to subtle under/over-charging and bypass comparison limits. (e.g., USD $20.50 is represented as `2050`, currency `"USD"`).

### 5. Deterministic Policy and Monotonic Merge
- **Decision:** Policy is a pure, side-effect-free function:
  `evaluate(request, facts, jevSignals?) => { disposition, ruleIds, reasons }`
- **Disposition Hierarchy:**
  `ALLOW (0) < REQUIRE_APPROVAL (1) < PAUSE_REVIEW (2) < DENY (3)`
- **Monotonic Tighten-Only Rule:**
  `final_disposition = max(policy_disposition, jev_disposition)`
- **Safety Invariant:**
  An AI model (Jev or any LLM) can only *tighten* a disposition (e.g., move `ALLOW` to `REQUIRE_APPROVAL` or `PAUSE_REVIEW`), NEVER loosen or authorize a denied/unapproved action.

### 6. Jev Model Fail-Safe Behavior
- **Decision:**
  - If Jev is unreachable, times out (>5s), or returns an unexpected/invalid payload:
    - Consequential actions degrade automatically to at least `REQUIRE_APPROVAL`.
    - Audit log explicitly records `jev_status = "unavailable" | "invalid"` and notes that Jev did not run.
    - Never fake model signals or silently bypass safety checks.

### 7. Untrusted vs. Trusted Data Boundaries
- **Decision:**
  - User and agent prompt text is strictly treated as untrusted data.
  - Data sent to Jev is strictly allowlisted: payment status, requested amounts, currency, structured action, and the free-text request enclosed in unambiguous delimiters (`<untrusted_request_text>`).
  - No secrets, credentials, tokens, customer names, or emails are ever sent to the model or committed to git.

### 8. Audit Trail Integrity
- **Decision:**
  - Append-only audit log in SQLite containing:
    `operation_id`, `request_id`, `requester_id`, `rule_ids`, `jev_status`, `jev_signals`, `approver_id`, `final_disposition`, `provider_reference`, `verification_state`, timestamps.
  - `audit_log` schema includes `prev_hash` and `row_hash` for forward-compatible tamper evidence.

