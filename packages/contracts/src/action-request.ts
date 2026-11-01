import { z } from 'zod';
import { createHash } from 'node:crypto';
import { MoneySchema, type Money } from './money.js';

export const ActionTypeEnum = {
  REFUND: 'REFUND',
} as const;

export type ActionType = (typeof ActionTypeEnum)[keyof typeof ActionTypeEnum];

export const ActionTypeSchema = z.enum([ActionTypeEnum.REFUND]);

/**
 * Structured request intake schema.
 * All incoming requests through MCP or dashboard must validate against this.
 */
export const ActionRequestSchema = z.object({
  request_id: z
    .string()
    .min(1, 'request_id is required')
    .max(128, 'request_id exceeds maximum length'),
  action_type: ActionTypeSchema.default(ActionTypeEnum.REFUND),
  payment_id: z
    .string()
    .min(1, 'payment_id is required')
    .max(128, 'payment_id exceeds maximum length'),
  amount: MoneySchema.optional(),
  reason: z
    .string()
    .min(1, 'reason is required')
    .max(1024, 'reason cannot exceed 1024 characters'),
  requester_id: z
    .string()
    .min(1, 'requester_id is required')
    .max(128, 'requester_id exceeds maximum length'),
  metadata: z.record(z.unknown()).optional(),
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;

/**
 * Computes a deterministic canonical SHA-256 fingerprint of the core request parameters.
 * Used for detecting parameter reuse / tampering on idempotent replays (IDEMP-002).
 */
export function computeParamsFingerprint(request: {
  action_type: string;
  payment_id: string;
  amount?: Money;
  reason: string;
}): string {
  const canonicalPayload = {
    action_type: request.action_type,
    amount_minor: request.amount?.amount_minor ?? null,
    currency: request.amount?.currency ?? null,
    payment_id: request.payment_id,
    reason: request.reason.trim(),
  };

  const jsonString = JSON.stringify(canonicalPayload, Object.keys(canonicalPayload).sort());
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

/**
 * Computes an action hash for approvals binding to the exact action details.
 * Prevents approvals from being applied to modified amounts, targets, or providers.
 */
export function computeActionHash(params: {
  operation_id: string;
  payment_id: string;
  amount?: Money;
  requester_id: string;
  provider: string;
}): string {
  const payload = {
    amount_minor: params.amount?.amount_minor ?? null,
    currency: params.amount?.currency ?? null,
    operation_id: params.operation_id,
    payment_id: params.payment_id,
    provider: params.provider,
    requester_id: params.requester_id,
  };
  const jsonString = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(jsonString, 'utf8').digest('hex');
}

