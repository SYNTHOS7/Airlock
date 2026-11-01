# Airlock --- Day 4 of 7: Jev Integration and Evaluation

**Goal:** Jev provides typed signals that can only tighten decisions,
and a small evaluation shows what it adds.

**Spec refs:** Part II sections 3 (principle 2), 7 (Jev), 14
(evaluation).

## Outcome by end of day

-   Jev SDK capabilities confirmed and documented.
-   Redacted input builder, validated client, fail-safe behavior.
-   Tighten-only merge with policy.
-   30 to 40 labeled scenarios and a rules-only vs Jev + policy report.

## Block 1 --- SDK spike (about 1.5h)

Do this first. The SDK is unverified.

-   [ ] Read the TypeSafe SDK docs, install it, make one real call.
-   [ ] Record in `docs/decisions.md`: auth method, available question
    types, response shape, rate limits, latency, error behavior, quota.
-   [ ] Map signals to what Jev supports:

  -----------------------------------------------------------------------
  Signal                  Purpose                 If unsupported
  ----------------------- ----------------------- -----------------------
  `intent_match`          Request text matches    Use a yes/no/unclear
                          structured action?      question

  `injection_suspected`   Text tries to steer the Closest classification
                          agent?                  available

  `ambiguity`             low / medium / high     Drop it

  `route`                 One of five routes      Keep only if supported
  -----------------------------------------------------------------------

-   [ ] If Jev supports very little, **shrink the signal set** and say
    so. Never fake output.

## Block 2 --- input builder and client (about 2h)

-   [ ] `buildJevInput` uses an **allowlist**: payment status, amounts,
    currency, prior attempt status, structured action.
-   [ ] Request `reason` and notes go in a clearly delimited untrusted
    field. Never send names, emails, addresses, tokens, secrets, or full
    provider records.
-   [ ] Test: facts containing an email and a token yield an input with
    neither.
-   [ ] Client: hard timeout (about 5s), at most one bounded retry, Zod
    validation, return
    `{ status: 'ran'|'unavailable'|'invalid', signals?, version?,
    latencyMs }`. Store these in `decisions`.

## Block 3 --- mapping and merge (about 1.5h)

``` ts
function jevToDisposition(j): Disposition {
  if (j.status !== 'ran') return REQUIRE_APPROVAL;   // fail-safe
  let d = ALLOW;
  if (j.signals.intent_match !== 'yes') d = max(d, PAUSE_REVIEW);
  if (j.signals.injection_suspected)    d = max(d, PAUSE_REVIEW);
  if (j.signals.ambiguity === 'high')   d = max(d, REQUIRE_APPROVAL);
  if (j.signals.route === 'refuse')     d = max(d, PAUSE_REVIEW);
  return d;
}
final = mergeDispositions(policy.disposition, jevToDisposition(j));
```

-   [ ] Read-only paths work without Jev.
-   [ ] Record `JEV-001` when Jev changed the outcome.

## Block 4 --- stubbed-Jev tests (about 1h)

-   [ ] Stub says proceed, policy says `DENY`: stays `DENY`.
-   [ ] Stub flags injection on an otherwise allowed request:
    `PAUSE_REVIEW`.
-   [ ] Stub times out or returns garbage: at least `REQUIRE_APPROVAL`,
    audit says Jev did not run.
-   [ ] Jev can never produce a result less strict than policy.

## Block 5 --- evaluation (about 3h)

**Scenario file:** each case has `id`, `category`, `request`, `facts`,
`expected_min_disposition`, `expected_max_disposition`, `notes`. Use
ranges, not single answers.

  -------------------------------------------------------------------
  Category                                 Count   Jev expected to
                                                   help?
  ---------------------------------------- ------- ------------------
  Normal, clearly safe                     6--8    No (must not
                                                   over-block)

  Limit and state violations               4--6    No

  Duplicates, unknown outcome, pending     4--6    No

  Request text vs structured action        6--8    **Yes**
  mismatch                                         

  Injected instructions in reason/note     6--8    **Yes**

  Ambiguous wording                        3--4    **Yes**
  -------------------------------------------------------------------

-   [ ] Write most by hand; review every generated variant and fix labels
    yourself. Vary the injection wording.
-   [ ] **Hold out 8 to 10 cases** in a separate file and run them once
    at the end.
-   [ ] Runner: both configurations, cache Jev responses by input hash,
    record latency, output JSON + Markdown into `tests/eval/results/`.
-   [ ] Report with the **case count**: unsafe-block rate, false-block
    rate, correct abstention, **Jev uplift** (tightened what rules
    missed), **over-tightening**, latency, and a prose list of failures.

## Exit criteria

-   One real Jev call works; capabilities documented.
-   All stub tests pass.
-   A results report with real numbers exists. You can say: "Jev caught
    N cases rules missed and over-blocked M safe ones."

## If behind or Jev is unworkable

-   Keep the interface and merge, ship a clearly labeled "Jev not
    integrated" mode, and say so in the README and video. Do not
    simulate Jev output.
-   Cut the scenario set to 25, but keep the held-out cases.
-   A weak result is fine if reported honestly.

## End-of-day checklist

-   [ ] SDK capabilities recorded
-   [ ] Redaction and fail-safe tested
-   [ ] Tighten-only merge tested
-   [ ] Eval report with case counts
