# Airlock --- Day 1 of 7: PayPal Spike, Setup, Contracts, State Machine

**Goal:** learn how PayPal refunds really behave, then lay the
foundation (repo, shared contracts, guarded state machine).

**Spec refs:** Full Spec Part II sections 9 (state machine), 11 (PayPal
plan), 18 (decisions).

> **Read first: the 7-day trade-offs.** This plan compresses the 10-day
> plan, so there is **no buffer day**. To make it fit, these are cut:
> hash-chained audit, the metrics view, webhooks (polling only), and the
> evaluation set shrinks to 30 to 40 scenarios. Everything in the Full
> Spec's "Must build" list stays. Plan for 8 to 10 hour days solo, or
> split the work across teammates (see Day 7 notes).

## Outcome by end of day

-   Sandbox capture, refund, and lookups work.
-   PayPal behavior answers recorded in `docs/decisions.md`.
-   Repo skeleton, license, `.env.example` committed.
-   Contracts package and state machine tested.

## Block 1 --- rules and access (about 2h)

-   [ ] Read the official hackathon rules: deadline, eligibility,
    submission fields, video length, license requirement. Write the
    deadline at the top of `docs/decisions.md`.
-   [ ] Create or open a PayPal Developer account; create (or use the
    defaults for) a sandbox **business** and **personal** account.
-   [ ] Create a REST app; put the sandbox client ID and secret in a
    local `.env` (never committed).
-   [ ] Get an access token
    (`POST https://api-m.sandbox.paypal.com/v1/oauth2/token`).

## Block 2 --- create something to refund (about 1h)

-   [ ] `POST /v2/checkout/orders` with `intent=CAPTURE`, small amount
    (for example 20.00 USD).
-   [ ] Approve it as the sandbox personal account via the approval link.
-   [ ] `POST /v2/checkout/orders/{id}/capture`. Save the **capture
    ID**.
-   [ ] `GET /v2/payments/captures/{capture_id}`; save the JSON (secrets
    removed).

## Block 3 --- the experiments (about 2.5h)

Record request, status code, and body for each in
`docs/spike-notes.md`.

  ------------------------------------------------------------------------
  \#   Experiment                          What you learn
  ---- ----------------------------------- -------------------------------
  1    `POST /v2/payments/captures/{id}/   Baseline: refund ID, status
       refund` with `amount`,              (`COMPLETED` or `PENDING`), is
       `PayPal-Request-Id`, `custom_id`    `custom_id` echoed

  2    `GET /v2/payments/refunds/{id}`     Is `custom_id` readable; what
                                           fields help verification

  3    Same Request-Id, same body          **Key question:** original
                                           returned, or a second refund

  4    Same Request-Id, different amount   Reject, replay, or refund again

  5    New Request-Id, same amount         Confirms a new key means a new
                                           refund

  6    Capture details after refunds       Refunded amount, status, links

  7    Over-refund, and refund of a fully  Error shapes for `LIMIT-001`
       refunded capture                    and `STATE-001`
  ------------------------------------------------------------------------

Skip webhooks. Plan to verify by polling.

## Block 4 --- decisions (about 45m)

-   [ ] In `docs/decisions.md` write: how a **lost response** will be
    verified (same-key replay, capture details, or fall back to human
    review), how refund statuses map to internal states, and what the
    mock must imitate.
-   [ ] If replay behavior is unclear, decide now: `OUTCOME_UNKNOWN`
    falls back to `NEEDS_REVIEW` when evidence can't prove the result.

## Block 5 --- repo and contracts (about 2.5h)

-   [ ] Monorepo layout from the Full Spec (`apps/`, `packages/contracts`,
    `services/`, `providers/`, `tests/`, `docs/`), TypeScript, workspace,
    lint, Vitest.
-   [ ] `.gitignore` (`.env`, `*.db`), `.env.example` (names only),
    LICENSE (OSI-approved).
-   [ ] `packages/contracts`: `Money` (integer minor units + currency),
    `ActionRequest`, `OperationState` enum, `Disposition` enum with order
    `ALLOW < REQUIRE_APPROVAL < PAUSE_REVIEW < DENY`, `ToolResult`
    (`status`, `reason`, `evidence_refs`, `operation_id`).
-   [ ] State machine transition table from the diagram;
    `transition(op, to)` throws on any illegal transition. `FAILED`
    returns to `EVALUATING`, never straight to `READY`.
-   [ ] Unit-test every allowed transition and a sample of forbidden
    ones.

## Exit criteria

-   Every experiment row has a result (or "not possible in Sandbox").
-   Lost-response verification strategy written down.
-   State machine and contracts tested; no secrets in `git log`.

## If behind

-   Skip experiments 4 and 7 for now; run them on Day 5 when the adapter
    exists.
-   Keep the state machine tests to allowed transitions plus three
    forbidden ones.

## End-of-day checklist

-   [ ] Deadline recorded
-   [ ] Capture ID and refund working
-   [ ] Decisions written
-   [ ] Repo, contracts, state machine committed
