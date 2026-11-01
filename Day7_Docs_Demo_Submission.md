# Airlock --- Day 7 of 7: Docs, Demo Video, Submission

**Goal:** submit a clean, public, working project. If the deadline
allows, **submit a few hours early**. There is no buffer day in this
plan, so protect time for recording and upload.

**Spec refs:** Part II sections 15 (demo), 19 (threat model), 20
(checklist).

## Outcome by end of day

-   README, docs, and diagrams done.
-   Public repo with license.
-   Demo video under three minutes.
-   Submission confirmed.

## Block 1 --- README and docs (about 3h)

### README

-   [ ] Problem, thesis, and tagline: "Nothing reaches the payment rail
    until it's checked, approved, and verified."
-   [ ] What Airlock does (the 10 steps), architecture and data-flow
    diagrams (mermaid renders on GitHub; copy from the Full Spec).
-   [ ] Safety boundaries: the tighten-only rule for Jev; what policy
    enforces.
-   [ ] **Setup:** prerequisites, install, `.env` from `.env.example`,
    Sandbox credentials, run commands, demo reset.
-   [ ] **Testing:** how to run, which tests need Sandbox credentials,
    and **what the tests do and do not prove.**
-   [ ] **Evaluation:** Day 4 results with case counts and definitions,
    including where Jev did not help.
-   [ ] **Honest limits:** demo auth, SQLite, one provider operation,
    simulated faults, no hash-chained audit, polling instead of
    webhooks, no production claims.
-   [ ] Future work (hash chaining, webhooks, more providers, metrics
    view).

### Docs folder

-   [ ] `docs/architecture.md` (reuse the Full Spec diagrams),
    `docs/threat-model.md` (the risk table, updated to what you built
    and tested), `docs/decisions.md` (final PayPal findings and Jev
    capabilities).

## Block 2 --- record the demo (about 2.5h)

Target **2:30 to 2:50**. Script and time it.

  --------------------------------------------------------------------
  Time        Scene              Show
  ----------- ------------------ -------------------------------------
  0:00-0:15   Problem            Agents misread, get manipulated, and
                                 retry blindly. Airlock is the safety
                                 passage.

  0:15-0:35   Evaluate           Normal request, Jev signals, policy
                                 result, audit entry

  0:35-1:15   Approval           Large refund needs approval;
                                 requester can't self-approve; a
                                 different approver approves; real
                                 Sandbox refund; verified

  1:15-2:00   Lost response      Real refund sent, response dropped
                                 (labeled "simulated lost response").
                                 `OUTCOME_UNKNOWN`, verify, exactly one
                                 refund, no blind retry

  2:00-2:30   Adversarial        Injected note flagged and tightened;
                                 over-limit and split refunds blocked

  2:30-2:50   Evidence           Audit timeline, rules vs Jev result,
                                 closing line
  --------------------------------------------------------------------

-   [ ] Label every simulated event on screen and in voiceover.
-   [ ] Check browser tabs, terminal history, and `.env` for secrets
    before recording.
-   [ ] Record short takes; keep the fallback recording handy.
-   [ ] Upload (public or unlisted per the rules) and test the link
    while logged out.

## Block 3 --- release and submit (about 2.5h)

-   [ ] Name check: GitHub repo and npm names, quick search for existing
    "Airlock" products. Rename via the single config constant if needed.
-   [ ] Make the repo public; confirm the LICENSE is visible and
    complete.
-   [ ] **Fresh-clone test** in a new folder or container, following only
    the README. Fix any missing step.
-   [ ] Final secret scan on the public repo.
-   [ ] Tag a release (for example `v1.0-submission`).
-   [ ] Re-read the official submission fields; fill in repo link, video
    link, description, and anything else required.
-   [ ] Submit, then open the confirmation or public listing and verify
    the links work.

## If you have teammates

  -----------------------------------------------------------------------
  Role                    Owns
  ----------------------- -----------------------------------------------
  Backend / safety core   Contracts, state machine, storage, policy,
                          approvals, write-ahead, verifier

  Integrations            PayPal adapter, fault injection, mock, MCP
                          tools, conformance tests

  AI / eval               Jev client, redaction, scenarios, evaluation
                          report

  Frontend / docs / demo  Dashboard, README, diagrams, video
  -----------------------------------------------------------------------

Agree on the contracts package on Day 1 first; everyone depends on it.

## Exit criteria

-   A stranger can clone, set up, and run it from the README.
-   Video is public, under three minutes, and labels simulated events.
-   Submission confirmed.

## If behind

-   Priority order: working repo and README, then demo video, then
    threat-model doc, then polish. A short honest README beats a long
    unfinished one.
-   If the live Sandbox demo is flaky, use the fallback recording for
    that segment and say so.

## End-of-day checklist

-   [ ] README and docs complete and honest
-   [ ] Video recorded, uploaded, link tested
-   [ ] Fresh-clone test passed
-   [ ] Secret scan clean
-   [ ] Submitted and confirmed
