import { DispositionEnum, type ActionRequest } from '@airlock/contracts';
import type { RuleResult } from '../types.js';

// Recognized ISO 4217 fiat payment rail currencies (excluding crypto/tokens like USDC)
const SUPPORTED_RAIL_CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'SGD', 'CHF', 'INR', 'MXN', 'BRL', 'NZD', 'SEK', 'NOK', 'DKK', 'HKD'
]);

// SQL injection patterns in free-text fields
const SQLI_PATTERNS = [
  /'\s*(?:OR|AND)\s*['"]?1['"]?\s*=\s*['"]?1/i,
  /;\s*(?:DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE)\s+/i,
  /UNION\s+(?:ALL\s+)?SELECT/i,
  /xp_cmdshell/i,
  /--\s*$/m,
  /\/\*.*?\*\//,
];

/**
 * INPUT-001: Comprehensive Parameter & Boundary Validation
 * Enforces:
 * 1. Positive minor-unit amount strictly greater than zero.
 * 2. Supported ISO 4217 fiat payment rail currency (no crypto like USDC).
 * 3. Payment ID must not contain null bytes (\x00) or non-printable control characters.
 * 4. Reason must be non-empty string.
 * 5. Free-text reason must not contain SQL injection payloads.
 */
export function checkInput(request: ActionRequest): RuleResult {
  // 1. Amount validation
  if (request.amount) {
    if (!Number.isFinite(request.amount.amount_minor) || request.amount.amount_minor <= 0) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: 'Refund amount must be strictly greater than zero.',
      };
    }

    if (!SUPPORTED_RAIL_CURRENCIES.has(request.amount.currency)) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: `Unsupported payment rail currency '${request.amount.currency}'. Must be a supported ISO 4217 fiat currency.`,
      };
    }
  }

  // 2. Payment ID validation (null-bytes and control character injection)
  if (request.payment_id) {
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(request.payment_id)) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: 'Payment ID contains invalid control characters or null bytes.',
      };
    }
  }

  // 3. Reason validation
  const reasonText = (request.reason || '').trim();
  if (reasonText.length === 0) {
    return {
      triggered: true,
      rule_id: 'INPUT-001',
      disposition: DispositionEnum.DENY,
      reason: 'A non-empty business justification reason is mandatory for audit logging.',
    };
  }

  // 4. SQL Injection detection in reason field
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(reasonText)) {
      return {
        triggered: true,
        rule_id: 'INPUT-001',
        disposition: DispositionEnum.DENY,
        reason: 'Malicious SQL injection pattern detected in refund reason.',
      };
    }
  }

  return {
    triggered: false,
    rule_id: 'INPUT-001',
    disposition: DispositionEnum.ALLOW,
    reason: 'Request input parameters are valid.',
  };
}
