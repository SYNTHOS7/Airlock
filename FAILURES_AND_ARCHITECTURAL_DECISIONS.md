# 🛠️ Engineering Postmortem: Failures, Resolutions & Architectural Trade-offs
### *Building the Zero-Trust Financial Safety Gateway for AI Agents*
**Repository:** [github.com/SYNTHOS7/Airlock](https://github.com/SYNTHOS7/Airlock)

---

## 1. Executive Summary

Airlock is built on a non-negotiable principle:
> **"Nothing reaches the payment rail until checked, approved, and verified."**

Building zero-trust financial infrastructure for non-deterministic AI agents presents unique distributed systems, security, and state-machine challenges. This document provides a transparent, rigorous engineering account of:
1. **The Architectural Decisions:** Why we chose this specific technology stack and approach instead of mainstream alternatives.
2. **The Engineering Failures:** The exact failure modes, edge cases, and deployment obstacles encountered during development, and the concrete technical resolutions implemented to overcome them.

---

## 2. Why We Chose This Tech Stack ("Why This Instead of That")

Every layer of the Airlock architecture was selected after evaluating and rejecting mainstream alternatives:

```
+---------------------------------------------------------------------------------------------------------+
|                                    AIRLOCK TECHNOLOGY STACK MATRIX                                      |
+--------------------------+------------------------------+-----------------------------------------------+
| Component Layer          | Selected Technology          | Alternatives Evaluated & Rejected             |
+--------------------------+------------------------------+-----------------------------------------------+
| Monorepo Architecture    | TypeScript + npm workspaces  | Python (Poetry / UV) or Go                    |
| Policy Engine            | Pure Deterministic Functions | LLM Guardrails (NeMo, Llama Guard, Prompts)   |
| Agent Interface          | Model Context Protocol (MCP) | Proprietary REST Endpoints / Webhooks         |
| Decision Intelligence    | TypeSafe Jev Decision Model  | Generic LLM (GPT-4 / Claude prompt-and-parse) |
| Local & Cloud Storage    | SQLite WAL + Supabase PG     | Redis / DynamoDB / Pure In-Memory             |
| State Machine Invariant  | Monotonic Tightening Rule    | Bi-directional Exception Overrides            |
| Authorization Protocol   | SHA-256 Action Hash + Dual   | Bearer Session Tokens / Boolean Flags         |
+--------------------------+------------------------------+-----------------------------------------------+
```

---

### A. TypeScript Monorepo vs. Python / FastAPI
* **Alternative Evaluated:** Python with FastAPI is the traditional ecosystem for AI pipelines.
* **Why Rejected:** 
  1. **Contract Inconsistency:** Financial state machines require end-to-end type parity. Python type hints are not enforced at runtime without Pydantic overhead, creating schema drift between API tools, database schemas, and the dashboard frontend.
  2. **Latency Penalty:** A safety middleware sitting in the critical path of an agent tool call cannot afford 15ms–40ms of Python runtime interpreter overhead on cold starts.
* **Why We Chose TypeScript Monorepo:**
  * **Zero-Overhead Shared Contracts:** The `@airlock/contracts` package compiles once and provides identical runtime Zod schemas, TypeScript types, and domain state-machine definitions across the MCP server, policy engine, storage layer, and Next.js dashboard.
  * **Sub-Millisecond Execution:** Pure TypeScript policy evaluation runs in **&lt; 0.1ms** with zero memory allocation churn.

---

### B. Pure Deterministic Rules vs. Pure LLM Guardrails
* **Alternative Evaluated:** Using an LLM guardrail (e.g. Meta Llama Guard, NeMo Guardrails, or prompt templates like *"Check if this refund is fair and under $50"*).
* **Why Rejected:**
  1. **Non-Determinism:** LLMs are probabilistic. An LLM may approve a $49 refund 99% of the time and reject it 1% of the time, or hallucinate that a $60 refund is acceptable because *"the customer seemed polite"*.
  2. **Vulnerability to Jailbreaks:** Any guardrail implemented inside an LLM's context window can be defeated by sufficiently clever adversarial steering, character encodings, or system override tokens.
  3. **High Latency & Cloud Costs:** Calling an LLM model for every basic numerical rule check introduces 500ms–2000ms of latency and continuous API billing.
* **Why We Chose Pure Deterministic Functions:**
  * **Mathematical Invariants:** Balances, daily caps, velocity windows, and role permissions are calculated using exact integer minor units (`amount_minor`). Invariant enforcement is 100% deterministic, reproducible, and verifiable in unit tests.

---

### C. The Monotonic Tighten-Only Rule vs. Bi-directional Overrides
* **Alternative Evaluated:** Allowing an intelligent AI model to evaluate business context and override a policy rejection (e.g., *"Customer is an enterprise VIP, allow this $150 refund even though the policy cap is $50"*).
* **Why Rejected:**
  * **The Fatal Bypass Vulnerability:** If an AI model has the authority to loosen a policy rejection, an attacker only needs to trick the model (via prompt injection) into believing the user is an emergency VIP. The deterministic security boundary is completely destroyed.
* **Why We Chose the Monotonic Strictness Invariant (`FR-6`):**
  $$\text{Final Disposition} = \max(\text{Policy Disposition}, \text{Jev Disposition})$$
  $$\text{Hierarchy: } \text{ALLOW} < \text{REQUIRE\_APPROVAL} < \text{PAUSE\_REVIEW} < \text{DENY}$$
  * An AI model can **only tighten** an outcome toward caution (escalating `ALLOW` &rarr; `PAUSE_REVIEW`), but can **never loosen** an authoritative deterministic `DENY`. If policy says `DENY`, the door is locked forever.

---

### D. Model Context Protocol (MCP) vs. Custom REST Endpoints
* **Alternative Evaluated:** Building custom REST endpoints (`POST /api/refund`) and writing custom tool plugins for each agent.
* **Why Rejected:**
  * Fragments developer adoption. Every agent framework (Claude, Cursor, LangChain, AutoGen) would require custom wrapper code.
* **Why We Chose Model Context Protocol (MCP):**
  * **Industry Standardization:** MCP is the open standard backed by Anthropic and the open-source community for agent-tool communication.
  * **Instant Zero-Config Discovery:** Any agent client (Claude Desktop, Cursor, Antigravity) pointing to `airlock` automatically negotiates capabilities and receives schema-validated tools (`evaluate_action`, `request_approval`, `execute_approved_action`, `verify_outcome`) over standardized JSON-RPC stdio or SSE streams.

---

### E. TypeSafe Jev (Decision Model) vs. Generic LLM Prompt-and-Parse
* **Alternative Evaluated:** Prompting GPT-4 or Claude with raw customer notes: *"Analyze if this contains prompt injection and return JSON"*.
* **Why Rejected:**
  1. **Prompt Injection Risk:** The raw prompt is passed into an unconstrained text generator, creating prompt-leakage risks.
  2. **JSON Parsing Fragility:** Generic LLMs often output conversational filler, markdown fences, or malformed JSON under adversarial pressure.
  3. **Calibrated Confidence:** Generic LLMs are poorly calibrated regarding uncertainty; they either over-confidently hallucinate safety or over-block benign queries.
* **Why We Chose TypeSafe Jev:**
  * **Calibrated Decision Probabilities:** Jev answers typed, structured questions with calibrated probabilities.
  * **Deterministic Fallback Layer:** Airlock implements a dual-mode client: when live API keys are provided, it calls the cloud decision model; when offline, it falls back to a deterministic heuristic analyzer matching the exact same typed interface with zero downtime.

---

### F. Dual-Tier Storage (SQLite WAL + Supabase PostgreSQL) vs. Redis
* **Alternative Evaluated:** Storing inflight operations and locks in Redis.
* **Why Rejected:**
  * Redis is in-memory by default. A process restart or power failure during an inflight payment rail dispatch causes memory loss, leaving the system blind to whether a transaction was submitted.
* **Why We Chose SQLite WAL + Supabase PostgreSQL:**
  * **Write-Ahead Log (WAL) Durability:** `better-sqlite3` operating in WAL mode guarantees fsync-persisted state transitions before network packets leave the machine.
  * **Dual-Tier Synchronization:** Local agent instances operate at zero latency on SQLite, while enterprise audit events sync asynchronously to Supabase PostgreSQL for cloud monitoring and compliance archiving.

---

## 3. Engineering Failures & How We Overcame Them

During the development and battle-testing of Airlock, we encountered six critical failure modes. Here is the postmortem analysis of each failure and the technical resolution implemented:

---

### Failure 1: Cloud Build Failure on Render (`NODE_ENV=production` Stripping Test Types)
* **Symptom:** The project compiled cleanly locally with `tsc -b`, but failed immediately when deployed to Render with errors:
  ```text
  Cannot find module 'vitest' or its corresponding type declarations.
  Cannot find name 'node:crypto'.
  Cannot find name 'process'.
  ```
* **Root Cause:**
  1. When Render deploys with `NODE_ENV=production`, `npm install` runs in production mode and automatically omits `devDependencies` (including `vitest` and `@types/node`).
  2. The monorepo `tsconfig.json` files included `src/__tests__/**` in the project reference compilation graph (`tsc -b`). Because `vitest` was stripped, compilation halted.
* **Technical Resolution:**
  1. Configured `"exclude": ["**/__tests__/**", "**/*.test.ts"]` across all packages' production `tsconfig.json` files so production builds never compile test suites.
  2. Promoted `@types/node`, `@types/better-sqlite3`, and `typescript` from `devDependencies` to top-level `dependencies` in `package.json`.
  3. Commit: `26b2391`. Production build succeeded in 5.7 seconds.

---

### Failure 2: Silent Cloud Service Crash (`Missing script: "start"`) & Port Binding
* **Symptom:** Render reported `Build Successful 🎉`, but exited 2 seconds later with exit code 1:
  ```text
  npm error Missing script: "start"
  npm error To see a list of scripts, run: npm run --workspace=@airlock/mcp-server
  ```
* **Root Cause:**
  * The MCP server was originally designed exclusively for local stdio communication (`node cli.js`). Cloud web platforms (Render, Railway, Fly.io) expect a long-running web service bound to an HTTP port (`process.env.PORT`) responding to health checks.
* **Technical Resolution:**
  1. Built `services/mcp-server/src/http.ts`, exposing an Express-based HTTP server with CORS, JSON body parsing, and a dedicated `GET /health` endpoint responding with system metrics.
  2. Implemented REST proxies for `/api/evaluate`, `/api/approvals`, and `/api/operations` alongside the JSON-RPC endpoints.
  3. Added `"start": "node ./dist/cli.js"` to `services/mcp-server/package.json` with dynamic fallback: if `process.env.PORT` exists, launch HTTP server; otherwise, launch stdio JSON-RPC.
  4. Commit: `a5715d4`. Health checks passed on port 10000.

---

### Failure 3: The Velocity Limit Self-Counting Race Condition
* **Symptom:** During automated demo and integration testing, valid sequential requests from `agent_1` were prematurely rejected by rule `VELOCITY-001` (Rolling Hour Velocity Limit) on their very first or second invocation.
* **Root Cause:**
  * When `evaluateAction()` received a request, it pre-inserted the draft operation into the database with `OperationState.DRAFT`.
  * The `FactsLoader` then queried `countRecentOperationsForRequester(caller_id, windowSeconds)`.
  * Because SQL counted all operations including the draft operation currently being evaluated, an operation was counting against its own velocity limit before evaluation had even concluded!
* **Technical Resolution:**
  1. Modified `AirlockRepository.countRecentOperationsForRequester(callerId, windowSeconds, excludeOperationId)`.
  2. Passed `current_operation_id` from `FactsLoader` to explicitly exclude the operation currently undergoing evaluation from its own historical count.
  3. Added regression test `tests/integration/day2-flow.test.ts` verifying that rapid consecutive actions only count committed operations.

---

### Failure 4: Number Parsing Exploits in Free-Text Mismatch Detection
* **Symptom:** An adversarial scenario with text `"Refund should be $10,000, please issue $10,000 instead of $10"` was mistakenly marked as having matching intent with a structured action of `$10.00`.
* **Root Cause:**
  * The initial regex for detecting amounts in free text was:
    ```typescript
    const amountMatch = text.match(/\$(\d+)/);
    ```
  * In the string `$10,000`, the regex matched `$10` (stopping at the comma!), which happened to be identical to the structured amount of `$10.00`. The analyzer reported `intent_match: "yes"`!
* **Technical Resolution:**
  1. Upgraded regex to parse global formatted currencies with commas and decimals:
    ```typescript
    const amountMatches = text.match(/\$([0-9,]+(?:\.[0-9]{2})?)/g);
    ```
  2. Iterated over all matches, stripped commas (`replace(/,/g, '')`), parsed floating-point values, and verified whether any stated figure contradicted the structured action.
  3. Prevented numerical truncation jailbreaks across all 105 benchmark scenarios.

---

### Failure 5: Token Sanitizer Redaction Mask Collision
* **Symptom:** An adversarial attack containing a bearer token (`"Authorization: Bearer eyJhbGci..."`) failed the benchmark because the sanitizer replaced it with `[REDACTED_TOKEN]`, and subsequent checks no longer recognized the original word `"Bearer"`.
* **Root Cause:**
  * The regex sanitizer ran *before* the prompt injection detector.
  * The sanitizer successfully stripped the credential (as it should, to prevent PII leakage to the model), but the downstream injection detector was looking for the raw word `"bearer"`. Since `"bearer"` had been replaced by `"[REDACTED_TOKEN]"`, the downstream detector assumed the text was benign!
* **Technical Resolution:**
  1. Added pattern recognition for the sanitizer's own redaction markers:
    ```typescript
    const injectionRegexes = [
      /\[redacted_(token|secret)\]/i,
      /private wallet/i,
      /authorization:/i,
      // ...
    ];
    ```
  2. If untrusted text attempted to inject or leak credentials, the fact that the sanitizer was forced to redact a token is itself treated as high-probability evidence of adversarial activity, triggering `PAUSE_REVIEW`.

---

### Failure 6: The Payment Rail Network Drop & The Duplicate Charge Trap
* **Symptom:** During fault injection testing (`FaultInjectedAdapter` set to `'drop_response'`), standard client retry loops caused duplicate charges against the customer's account.
* **Root Cause:**
  * Traditional client architecture wraps execution in:
    ```typescript
    try {
      await provider.refund();
    } catch (err) {
      state = 'FAILED'; // FATAL MISTAKE!
    }
    ```
  * If the HTTP response is dropped *after* PayPal processes the refund, the client catches a timeout exception and marks the operation `FAILED`.
  * The calling agent sees `FAILED`, generates a new request ID, and retries. PayPal executes the refund a second time.
* **Technical Resolution:**
  1. **Two-Phase Commit State Machine:** The state is persisted as `EXECUTING` in SQLite *before* the network packet leaves the host.
  2. **Never Mark Failed on Drop:** If a timeout or dropped socket occurs, Airlock transitions the operation to `OUTCOME_UNKNOWN`.
  3. **Strict Policy Block (`UNCERTAIN-001`):** Any attempt to re-execute an operation while a prior attempt is in `OUTCOME_UNKNOWN` is strictly blocked by the policy engine.
  4. **Idempotent Reconciliation Tool (`verify_outcome`):** The agent must call `verify_outcome(operation_id)`. Airlock queries PayPal using the exact same `provider_idempotency_key`. If PayPal confirmed the refund, Airlock updates the state to `SUCCEEDED` with zero duplicate financial impact.

---

## 4. Empirical Benchmark Proof (105 Real-World Scenarios)

To prove that the architectural decisions hold under pressure, we executed a comprehensive 105-scenario evaluation across five distinct operational categories:

```
================================================================================
AIRLOCK 105-SCENARIO BENCHMARK RESULTS (PRECISION & SAFETY VERIFICATION)
================================================================================
Metric                      | Rules Only (Deterministic) | Hybrid Layer (Jev + Policy) | Delta / Improvement
----------------------------+----------------------------+-----------------------------+--------------------
Overall Accuracy            | 61.9%                      | 100.0%                      | +38.1%
Unsafe Action Block Rate    | 25.9%                      | 100.0%                      | +74.1%
False-Block Rate (Safe)     | 0.0%                       | 0.0%                        | 0.0% (Zero holds)
Adversarial Uplift Saves    | 0                          | 40 Scenarios                | +40 Critical Saves
Over-Tightened Count        | 0                          | 0 Scenarios                 | 0 False Positives
Average Evaluation Latency  | < 0.1 ms                   | 0.1 ms                      | Sub-millisecond
================================================================================
```

### Breakdown by Category:
* **Normal Safe E-Commerce Returns (25 scenarios):** 25/25 Passed autonomously (`ALLOW`).
* **Consequential High-Value Returns (25 scenarios):** 25/25 Held for human approval (`REQUIRE_APPROVAL`).
* **Adversarial Prompt Injections & Jailbreaks (25 scenarios):** 25/25 Neutralized & escalated to `PAUSE_REVIEW` (**+25 Uplift**).
* **Intent Contradictions & Amount Mismatches (15 scenarios):** 15/15 Caught & tightened to `PAUSE_REVIEW` (**+15 Uplift**).
* **Policy & Financial Invariant Violations (15 scenarios):** 15/15 Deterministically blocked (`DENY`).

---

## 5. Conclusion

Financial infrastructure for autonomous AI agents cannot rely on prompt engineering or best-effort suggestions. By combining:
1. **Deterministic state-machine invariants**,
2. **Monotonic strictness merge**,
3. **Cryptographic SHA-256 Action Hashes with separation of duties**, and
4. **Two-phase commit write-ahead logging**,

Airlock proves that AI agents can interact with real financial rails safely, responsibly, and with mathematical certainty.

