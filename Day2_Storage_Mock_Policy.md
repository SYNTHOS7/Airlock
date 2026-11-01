# Airlock --- Day 2 of 7: Storage, Mock Adapter, Policy Engine

**Goal:** a request is validated, recorded, evaluated by deterministic
rules, and executed against a mock, with no AI and no real provider.

**Spec refs:** Part II sections 3 (principles 1, 2, 4, 8), 8 (rules), 13
(data model).

## Outcome by end of day

-   SQLite storage with idempotency and write-ahead records.
-   Startup reconciliation of interrupted operations.
-   Mock adapter with scripted scenarios.
-   Policy engine (pure function) with core rules, merge function, and
    tests.

## Block 1 --- storage (about 2h)

-   [ ] SQLite (`better-sqlite3` or similar) and one init/migration
    script.
-   [ ] Tables: `operations`, `decisions`, `approvals`, `evidence`,
    `audit_log` (fields in Part II section 13). Add `prev_hash` and
    `row_hash` columns to `audit_log` now, leave unfilled.
-   [ ] `request_id` unique; store `params_fingerprint` (SHA-256 of
    canonical JSON).
-   [ ] Repository functions that change state only through
    `transition`. `audit_log` is append-only in code.

## Block 2 --- idempotency and write-ahead (about 1h)

-   [ ] Same `request_id`, same parameters: return the existing
    operation (`IDEMP-001`).
-   [ ] Same `request_id`, different parameters: reject (`IDEMP-002`).
-   [ ] Before any provider call, persist the operation as `EXECUTING`
    with `provider_idempotency_key` derived from `operation_id`.
-   [ ] On startup, move every `EXECUTING` operation to
    `OUTCOME_UNKNOWN` and write an audit row.

## Block 3 --- mock adapter (about 1.5h)

``` ts
interface ProviderAdapter {
  refund(cmd: RefundCommand): Promise<RefundResult>;
  getRefund(refundId: string): Promise<RefundStatus>;
  getCapture(captureId: string): Promise<CaptureInfo>;
}
```

-   [ ] Modes: `success`, `declined`, `pending_then_complete`,
    `timeout_not_executed`, `timeout_but_executed` (lost response).
-   [ ] Behave like PayPal did in your Day 1 notes (replay semantics,
    error shapes). Cite `docs/spike-notes.md` in a comment.

## Block 4 --- policy engine (about 3h)

Pure function, no I/O:

``` ts
evaluate(request, facts, jevSignals?) => {
  disposition, ruleIds[], reasons[]
}
```

-   [ ] **Facts loader** (separate from the engine): caller roles,
    payment state via the adapter, completed and in-flight refunds for
    the payment, caller's recent refund count.
-   [ ] Rules, each its own function:

  --------------------------------------------------------------------
  Rule             Condition                        Disposition
  ---------------- -------------------------------- ------------------
  `AUTH-001`       Caller lacks permission          `DENY`

  `INPUT-001`      Amount or currency invalid       `DENY`

  `STATE-001`      Payment not refundable           `DENY` / pause

  `LIMIT-001`      Exceeds remaining refundable     `DENY`

  `LIMIT-002`      Completed + in-flight + request  `DENY` / approval
                   exceeds cap, or caller window    
                   total exceeded                   

  `VELOCITY-001`   More than N refunds in window    `REQUIRE_APPROVAL`

  `APPROVAL-001`   Amount above threshold           `REQUIRE_APPROVAL`

  `UNCERTAIN-001`  Prior attempt unknown or         `PAUSE_REVIEW`
                   `PENDING`                        
  --------------------------------------------------------------------

-   [ ] `mergeDispositions(a, b)` returns the stricter. This is where
    Jev plugs in on Day 4.
-   [ ] `policy.config.ts` for threshold, cap, window values.
-   [ ] Return **all** matching rule IDs; strictest disposition wins.

## Block 5 --- tests (about 1.5h)

-   [ ] One hit and one near-miss per rule (boundary values).
-   [ ] **Split-refund test:** five small refunds, each under the
    approval threshold, whose sum exceeds the cap. The last must not be
    auto-allowed.
-   [ ] `mergeDispositions` never returns less strict than either input.
-   [ ] Replay returns the same result; killing the process
    mid-execution and restarting leaves `OUTCOME_UNKNOWN`.

## Exit criteria

-   One request goes through policy and executes on the mock.
-   Replay causes no second execution.
-   Split-refund scenario blocked.
-   Policy function imports no network or database code.

## If behind

-   Implement `AUTH`, `INPUT`, `LIMIT-001`, `LIMIT-002`,
    `APPROVAL-001`, `UNCERTAIN-001` first; stub `VELOCITY-001` and
    `STATE-001` with skipped tests.
-   Only three mock modes: `success`, `declined`,
    `timeout_but_executed`.

## End-of-day checklist

-   [ ] Idempotency and reconciliation tested
-   [ ] Mock adapter works
-   [ ] Core rules and merge tested
-   [ ] Split-refund test passes
