# Airlock --- Day 3 of 7: Approvals, Recheck, Auth, Dashboard

**Goal:** approvals work end to end with separation of duties, still
with no AI.

**Spec refs:** Part II sections 3 (principles 5, 6, 7), 8
(`APPROVAL-002`), 13 (`approvals`).

## Outcome by end of day

-   Action-hash approvals: single-use, expiring.
-   Requester cannot approve their own request.
-   Fresh recheck of policy right before execution.
-   Demo auth and three dashboard views.

## Block 1 --- action hash (about 45m)

-   [ ] `action_hash = SHA-256(canonical JSON of { operation_id,
    action_type, payment_id, amount_minor, currency, provider })`.
-   [ ] Canonical JSON (sorted keys, no whitespace).
-   [ ] Test: changing any one field changes the hash.

## Block 2 --- approval service (about 2.5h)

-   [ ] `requestApproval(operation)`: row with `action_hash`,
    `requester_id`, `expires_at` (for example 15 minutes), status
    `PENDING`; operation becomes `AWAITING_APPROVAL`.
-   [ ] `approve(approvalId, approverId)` enforces `APPROVAL-002`:
    approver has the `approver` role, is not the requester, approval not
    expired, not already consumed, and the stored hash equals the hash
    recomputed from the current operation.
-   [ ] `reject(...)` moves the operation to `DENIED`.
-   [ ] **Atomic consume:** `UPDATE approvals SET consumed_at = now WHERE
    approval_id = ? AND consumed_at IS NULL AND status = 'APPROVED'`.
    Zero rows changed means refuse to execute.
-   [ ] Expiry checked at approve time and at execute time (skip the
    sweep job).

## Block 3 --- recheck before execution (about 1h)

-   [ ] `executeApproved(operationId)`:
    1.  load operation and approval,
    2.  consume approval atomically,
    3.  **re-run policy with fresh facts**,
    4.  if anything now fails, move to `DENIED` and record why,
    5.  write the write-ahead record, then call the adapter.
-   [ ] Test: approve, change the facts (another refund completes), then
    execute. Execution must be blocked.

## Block 4 --- demo auth (about 45m)

-   [ ] Users: `agent_1` (`support_agent`), `approver_1` (`approver`),
    `viewer_1` (`viewer`). Header token resolves to a user and roles.
-   [ ] Unknown token means `AUTH-001`.
-   [ ] README will say plainly: demo auth, not production auth.

## Block 5 --- dashboard (about 2.5h)

Next.js with a few shadcn components. **Three views only:**

1.  **New request:** payment ID, amount, reason; shows disposition and
    reasons.
2.  **Approval queue:** pending approvals with the exact action and
    requester; approve/reject; error if the user is the requester.
3.  **Audit timeline:** operations and their events in order, with a
    "simulated fault" badge ready for Day 6.

Add a user switcher dropdown to demo separation of duties.

## Tests (about 1h, run throughout)

-   [ ] Replayed approval refused.
-   [ ] Expired approval refused.
-   [ ] Hash-mismatched approval refused.
-   [ ] Self-approval refused.
-   [ ] Full path on the mock: `agent_1` requests, cannot approve,
    `approver_1` approves, checks pass, executes, audit complete.

## Exit criteria

-   End-to-end approval path works on the mock.
-   All approval tests pass.
-   Three dashboard views render and call the same service layer the MCP
    tools will use.

## If behind

-   Skip the dashboard request form; use a small API script, but keep
    the approval queue and audit views (they carry the demo).
-   Drop the user switcher and use two browser profiles.

## End-of-day checklist

-   [ ] Approval rules tested
-   [ ] Atomic consume tested
-   [ ] Recheck-before-execute tested
-   [ ] Three views working
