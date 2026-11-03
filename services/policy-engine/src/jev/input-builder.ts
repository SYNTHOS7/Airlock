import {
  type ActionRequest,
  type Money,
  toDecimalString,
  formatMoney,
} from '@airlock/contracts';
import type { PolicyFacts } from '../types.js';

export interface JevSanitizedInput {
  structured_action: {
    action_type: string;
    payment_id: string;
    amount: string | null;
    currency: string | null;
  };
  trusted_facts: {
    payment_status: string;
    remaining_refundable_amount: string;
    completed_refunds_total: string;
    prior_attempt_status: string;
  };
  untrusted_reason: string;
}

/**
 * Regex patterns for stripping sensitive tokens and PII from prompt text.
 */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BEARER_TOKEN_REGEX = /(?:bearer\s+|token[:=]\s*)[a-zA-Z0-9_\-\.]{12,}/gi;
const API_KEY_REGEX = /(?:api[_-]?key|secret|password)[:=]\s*["']?[a-zA-Z0-9_\-\.]{8,}["']?/gi;

/**
 * Strips secrets, tokens, and PII from untrusted free-text.
 */
export function sanitizeUntrustedText(text: string): string {
  return text
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(BEARER_TOKEN_REGEX, '[REDACTED_TOKEN]')
    .replace(API_KEY_REGEX, '[REDACTED_SECRET]');
}

/**
 * Builds the allowlisted, redacted payload sent to Jev (Day 4 Block 2).
 * 
 * Strict safety boundaries:
 * 1. Allowlist only: structured action + minimal trusted facts + sanitized text.
 * 2. Delimited untrusted text: enclosed in <untrusted_request_text> tags.
 * 3. Never sends tokens, credentials, full provider records, or PII.
 */
export function buildJevInput(
  request: ActionRequest,
  facts: PolicyFacts
): JevSanitizedInput {
  const sanitizedReason = sanitizeUntrustedText(request.reason || '');

  return {
    structured_action: {
      action_type: request.action_type,
      payment_id: request.payment_id,
      amount: request.amount ? toDecimalString(request.amount) : null,
      currency: request.amount ? request.amount.currency : null,
    },
    trusted_facts: {
      payment_status: facts.payment_capture_status,
      remaining_refundable_amount: formatMoney(facts.remaining_refundable_amount),
      completed_refunds_total: formatMoney(facts.completed_refunds_total),
      prior_attempt_status: facts.prior_attempt_state ?? 'NONE',
    },
    untrusted_reason: `<untrusted_request_text>\n${sanitizedReason}\n</untrusted_request_text>`,
  };
}

