# Airlock

> **Nothing reaches the payment rail until it's checked, approved, and verified.**

Airlock is an auditable safety and outcome-verification layer designed for financial AI agents and payment workflows (PayPal Sandbox + Mock).

---

## The Problem

Financial AI agents can understand "refund this payment," but:
1. They can misread a request or hallucinate transaction details.
2. They can be manipulated by untrusted text inside a customer note or reason field.
3. They can treat a network timeout as a failure and blindly retry, creating duplicate payments.

## What Airlock Does

- **Untrusted intake:** Treats all agent and customer text as untrusted.
- **Deterministic authorization:** AI models can *only tighten* decisions, never authorize or loosen.
  Strict hierarchy: `ALLOW < REQUIRE_APPROVAL < PAUSE_REVIEW < DENY`.
- **Guarded State Machine:** Prevents unauthorized jumps or blind retries.
- **Write-ahead intent:** Persists operations in SQLite before executing on the payment rail.
- **Outcome verification:** Unknown outcomes trigger verification against provider evidence, never blind retries.
- **Separation of duties:** Enforces that human approvers cannot approve their own requests.
- **Append-only audit trail:** Retains complete cryptographic fingerprints, decision reasons, and verification evidence.

---

## Monorepo Layout

```text
airlock/
├── apps/
│   └── dashboard/                 # Next.js: request intake, approval queue, audit timeline
├── packages/
│   └── contracts/                 # Shared schemas (Money, State Machine, ActionRequest, ToolResult, Jev)
├── services/
│   ├── mcp-server/                # MCP tools: evaluate_action, request_approval, execute_approved_action, verify_outcome
│   └── policy-engine/             # Deterministic rules (pure function) + monotonic merge
├── providers/
│   ├── paypal-sandbox/            # PayPal Sandbox adapter + fault injection wrapper
│   └── mock/                      # Deterministic test adapter with replay semantics
├── data/
│   └── scenarios/                 # Adversarial, limit, and evaluation scenarios
├── tests/
│   ├── policy/                    # Boundary tests for every rule ID
│   ├── integration/               # Write-ahead, crash recovery, unknown outcome flows
│   ├── provider/                  # Conformance suite across mock and PayPal sandbox
│   ├── adversarial/               # Injection, duplicate requests, split refunds
│   └── eval/                      # Rules-only vs Jev + policy comparison
├── docs/
│   ├── architecture.md            # Architecture diagrams & trust boundaries
│   ├── decisions.md               # Locked decisions and hackathon rules
│   └── spike-notes.md             # Empirical findings from PayPal API experiments
├── scripts/
│   └── paypal-spike.ts            # Sandbox verification & spike runner
├── .env.example
├── LICENSE                        # Apache 2.0
└── README.md
```

---

## Quickstart

### 1. Prerequisites
- Node.js >= 20 (tested with v24)
- npm >= 10

### 2. Setup
```bash
# Clone the repository
git clone https://github.com/your-username/airlock.git
cd airlock

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Run test suite
npm test
```

### 3. Running the PayPal Sandbox Spike
To verify connection and explore sandbox behavior:
```bash
npx tsx scripts/paypal-spike.ts
```

---

## License

[Apache License 2.0](LICENSE)

