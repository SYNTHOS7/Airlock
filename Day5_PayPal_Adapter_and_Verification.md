# Airlock --- Day 5 of 7: PayPal Sandbox Adapter and Verification

**Goal:** a real Sandbox refund goes through Airlock end to end, with
verification following your Day 1 findings.

**Spec refs:** Part II sections 5 (data flow), 9 (state machine), 11
(PayPal plan).

## Outcome by end of day

-   PayPal adapter implementing the same interface as the mock.
-   A verifier producing success, failure, or unresolved.
-   A conformance suite run against both adapters.
-   Happy path through Airlock against real Sandbox.

## Block 1 --- auth and HTTP client (about 1h)

-   [ ] OAuth token with caching until shortly before expiry.
-   [ ] HTTP wrapper with timeouts, structured errors, **redacted
    logging** (never the token, secret, or Authorization header).
-   [ ] Base URL from env
    (`https://api-m.sandbox.paypal.com`); refuse to start on a live URL.

## Block 2 --- refund call (about 2h)

-   [ ] `refund(cmd)` calls
    `POST /v2/payments/captures/{capture_id}/refund`.
-   [ ] `PayPal-Request-Id` = the stored `provider_idempotency_key`.
    The same operation always sends the same key.
-   [ ] `custom_id` = Airlock `operation_id`.
-   [ ] Full refund: empty body. Partial: `amount` with value and
    currency in PayPal's format.
-   [ ] Map results:

  -----------------------------------------------------------------------
  PayPal result                       Internal handling
  ----------------------------------- -----------------------------------
  Refund `COMPLETED`                  Verify, then `SUCCEEDED`

  Refund `PENDING`                    `VERIFYING` (fixed-interval poll
                                      with a cap, then escalate)

  Refund `FAILED` / `CANCELLED`       Verified `FAILED`

  4xx with a clear error              `FAILED` (not executed); record
                                      error

  Timeout, reset, 5xx, unparseable    `OUTCOME_UNKNOWN`
  -----------------------------------------------------------------------

-   [ ] A timeout is **never** mapped to `FAILED`.

## Block 3 --- lookups and verifier (about 2h)

-   [ ] `getRefund` (`GET /v2/payments/refunds/{id}`) and `getCapture`
    (`GET /v2/payments/captures/{id}`).
-   [ ] `verifyOperation(operation)` using the Day 1 strategy:
    1.  refund ID known: fetch it and compare amount, currency,
        `custom_id`;
    2.  not known: use the path you proved (same-key replay or capture
        details);
    3.  can't prove it: `unresolved`.
-   [ ] `MISMATCH-001`: provider amount, currency, or reference differs
    from the request, so `NEEDS_REVIEW`.
-   [ ] Store each lookup as an `evidence` row.

## Block 4 --- conformance suite (about 1.5h)

-   [ ] One suite parameterized over `[mock, paypal]`: successful
    refund, over-refund error, refund of an already refunded capture,
    same key twice (no double refund), lookup of a known refund.
-   [ ] PayPal tests tagged so they skip when credentials are missing.
-   [ ] Where mock and PayPal disagree, fix the **mock**.
-   [ ] Run the Day 1 experiments you skipped (4 and 7) here if needed.

## Block 5 --- happy path through Airlock (about 1.5h)

-   [ ] Script: request, policy (with Jev), approval, execute, verify
    against Sandbox, audit shows the PayPal refund ID.
-   [ ] Prepare a helper that creates fresh captures (refunded amounts
    get used up).

## Exit criteria

-   A real Sandbox refund runs through the full Airlock path.
-   Conformance suite green for the mock, and for PayPal with
    credentials.
-   No secrets in logs.

## If behind

-   If replay-based verification doesn't work, make the lost response
    escalate to `NEEDS_REVIEW` with the evidence collected.
-   Cap `PENDING` polling at a few tries, then escalate.

## End-of-day checklist

-   [ ] Real refund works through Airlock
-   [ ] Timeout maps to unknown, not failed
-   [ ] Verifier written and tested
-   [ ] Conformance suite green
