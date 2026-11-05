import {
  type JevSignals,
  JevSignalsSchema,
  type JevStatus,
} from '@airlock/contracts';
import { type JevSanitizedInput } from './input-builder.js';

export interface JevClientResponse {
  status: JevStatus;
  signals?: JevSignals;
  version?: string;
  latencyMs: number;
  error?: string;
}

export interface JevClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Client for Jev by TypeSafe (advisory model for text safety signals).
 * 
 * Safety properties:
 * - 5000ms hard timeout
 * - Maximum 1 bounded retry
 * - Zod schema validation of signals
 * - Fail-safe degradation on error or timeout
 */
export class JevClient {
  private apiKey?: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: JevClientOptions = {}) {
    this.apiKey = options.apiKey || process.env.TYPESAFE_API_KEY;
    this.baseUrl = options.baseUrl || process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai';
    this.timeoutMs = options.timeoutMs ?? 5000; // 5s hard timeout
    this.maxRetries = options.maxRetries ?? 1; // max 1 retry
  }

  /**
   * Evaluates untrusted request text against structured action facts.
   */
  public async evaluateSignals(input: JevSanitizedInput): Promise<JevClientResponse> {
    const startTime = Date.now();

    // If no live API key is configured, use deterministic analytical fallback
    if (!this.apiKey || this.apiKey === 'your_typesafe_api_key_here') {
      const signals = this.analyzeDeterministically(input);
      return {
        status: 'ran',
        signals,
        version: 'jev-local-heuristic-v2',
        latencyMs: Date.now() - startTime,
      };
    }

    let attempt = 0;
    while (attempt <= this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/v1/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: 'jev-safety-v1',
            input,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const rawJson = (await response.json()) as { signals?: unknown; version?: string };
        const parsed = JevSignalsSchema.safeParse(rawJson.signals);

        if (!parsed.success) {
          return {
            status: 'invalid',
            error: `Jev output schema validation failed: ${parsed.error.message}`,
            latencyMs: Date.now() - startTime,
          };
        }

        return {
          status: 'ran',
          signals: parsed.data,
          version: rawJson.version || 'jev-cloud-v1',
          latencyMs: Date.now() - startTime,
        };
      } catch (err: any) {
        clearTimeout(timer);
        const isLastAttempt = attempt > this.maxRetries;
        if (isLastAttempt) {
          return {
            status: 'unavailable',
            error: err.name === 'AbortError' ? 'Jev call timed out (>5000ms)' : err.message,
            latencyMs: Date.now() - startTime,
          };
        }
      }
    }

    return {
      status: 'unavailable',
      error: 'Jev service unavailable after retry',
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Deterministic signal extractor for local offline evaluation and testing.
   * Matches prompt injection vectors, intent discrepancies, and ambiguities.
   */
  public analyzeDeterministically(input: JevSanitizedInput): JevSignals {
    const text = input.untrusted_reason.toLowerCase();
    const actionAmount = input.structured_action.amount;

    // 1. Prompt Injection & Adversarial Steering Detection
    const injectionRegexes = [
      /override/i,
      /ignore (all )?(previous\b|instructions?\b|safety\b|policy\b|rules?\b|guardrails?\b|limits?\b|checks?\b)/i,
      /forget (all )?(previous\b|instructions?\b|limits?\b)/i,
      /disregard (all )?(previous\b|safety\b|policy\b|rules?\b)/i,
      /bypass (all )?(approvals?\b|authorizations?\b|checks?\b|reviews?\b|limits?\b|guardrails?\b|standard\b)?/i,
      /do not check/i,
      /refund immediately without/i,
      /system prompt/i,
      /system notice/i,
      /\bsudo\b/i,
      /grant access/i,
      /pre-approved/i,
      /admin instruction/i,
      /begin admin/i,
      /\bdan:|\bdan mode\b/i,
      /bearer\b/i,
      /developer (diagnostic )?mode/i,
      /diagnostic mode/i,
      /base64/i,
      /emergency payout/i,
      /red-team/i,
      /simulated transaction/i,
      /zero-day/i,
      /\b(emit|output)\s+allow\b|\bauto-allow\s+(all|any|this|without|every)\b/i,
      /execute_immediately/i,
      /token-leak/i,
      /\[redacted_(token|secret)\]/i,
      /private wallet/i,
      /authorization:/i,
      /```(json)?/i,
    ];
    const injectionSuspected = injectionRegexes.some((regex) => regex.test(text));

    // 2. Intent Discrepancy Detection (Text vs Structured Action)
    // Check if user text explicitly mentions cancellation, store credit, dispute, or different amount
    let intentMatch: 'yes' | 'no' | 'unclear' = 'yes';

    const cancelRegexes = [
      /do not refund/i,
      /cancel (this |the )?refund/i,
      /cancel this/i,
      /do not process/i,
      /do not disburse/i,
      /charged incorrectly/i,
      /stop all (automatic )?refunds/i,
      /store credit/i,
      /replacement (item|product)/i,
      /dispute/i,
      /chargeback/i,
      /fraud alert/i,
      /stolen identity/i,
      /money laundering/i,
      /duplicate ticket/i,
      /mistaken ticket/i,
      /revoked refund/i,
      /keep the software/i,
    ];
    if (cancelRegexes.some((regex) => regex.test(text))) {
      intentMatch = 'no';
    }

    // Check for amount mismatch (e.g. text mentions $10 but action is $50, or $10,000)
    const amountMatches = text.match(/\$([0-9,]+(?:\.[0-9]{2})?)/g);
    if (amountMatches && actionAmount) {
      const structuredAmount = parseFloat(actionAmount);
      for (const rawMatch of amountMatches) {
        const val = parseFloat(rawMatch.replace('$', '').replace(/,/g, ''));
        if (Math.abs(val - structuredAmount) > 0.01) {
          intentMatch = 'no';
          break;
        }
      }
    }

    // 3. Ambiguity Detection
    let ambiguity: 'low' | 'medium' | 'high' = 'low';
    const ambiguousPhrases = [
      'maybe refund',
      'refund whatever',
      'not sure if customer returned',
      'investigate first',
      'might have been duplicate',
      'partial or full not sure',
    ];
    if (ambiguousPhrases.some((p) => text.includes(p))) {
      ambiguity = 'high';
    } else if (text.length < 10) {
      ambiguity = 'medium';
    }

    // 4. Recommended Route
    let route: 'proceed' | 'inspect' | 'verify_outcome' | 'human_review' | 'refuse' = 'proceed';
    if (injectionSuspected) {
      route = 'human_review';
    } else if (intentMatch === 'no') {
      route = 'refuse';
    } else if (text.includes('lost response') || text.includes('timed out') || text.includes('verify first')) {
      route = 'verify_outcome';
    } else if (ambiguity === 'high') {
      route = 'inspect';
    }

    return {
      intent_match: intentMatch,
      injection_suspected: injectionSuspected,
      ambiguity,
      route,
      explanation: injectionSuspected
        ? 'Adversarial instruction or system override pattern detected in untrusted text.'
        : intentMatch === 'no'
        ? 'Stated intent in user text contradicts structured action parameters.'
        : 'Text appears consistent with structured action.',
    };
  }
}
