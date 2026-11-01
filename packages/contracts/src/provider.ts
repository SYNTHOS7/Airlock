import { z } from 'zod';
import { MoneySchema, type Money } from './money.js';

export const ProviderTypeEnum = {
  PAYPAL_SANDBOX: 'paypal_sandbox',
  MOCK: 'mock',
} as const;

export type ProviderType = (typeof ProviderTypeEnum)[keyof typeof ProviderTypeEnum];

export const ProviderRefundStatusEnum = {
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type ProviderRefundStatus =
  (typeof ProviderRefundStatusEnum)[keyof typeof ProviderRefundStatusEnum];

export const RefundCommandSchema = z.object({
  operation_id: z.string(),
  provider_idempotency_key: z.string(),
  capture_id: z.string(),
  amount: MoneySchema.optional(),
  reason: z.string().optional(),
});

export type RefundCommand = z.infer<typeof RefundCommandSchema>;

export const RefundResultSchema = z.object({
  provider_refund_id: z.string(),
  status: z.enum([
    ProviderRefundStatusEnum.COMPLETED,
    ProviderRefundStatusEnum.PENDING,
    ProviderRefundStatusEnum.FAILED,
    ProviderRefundStatusEnum.CANCELLED,
  ]),
  amount: MoneySchema,
  custom_id: z.string().optional(),
  raw_response: z.unknown().optional(),
});

export type RefundResult = z.infer<typeof RefundResultSchema>;

export const CaptureInfoSchema = z.object({
  capture_id: z.string(),
  status: z.string(),
  amount: MoneySchema,
  refunded_amount: MoneySchema,
  remaining_refundable_amount: MoneySchema,
  raw_response: z.unknown().optional(),
});

export type CaptureInfo = z.infer<typeof CaptureInfoSchema>;

/**
 * Standard Provider Adapter contract.
 * Both the PayPal Sandbox Adapter and the Mock Adapter implement this interface.
 */
export interface ProviderAdapter {
  readonly providerName: ProviderType;

  /**
   * Submits a refund for a captured payment.
   */
  refund(cmd: RefundCommand): Promise<RefundResult>;

  /**
   * Retrieves refund details by provider refund ID.
   */
  getRefund(refundId: string): Promise<RefundResult>;

  /**
   * Retrieves current capture information including remaining refundable balance.
   */
  getCapture(captureId: string): Promise<CaptureInfo>;
}

