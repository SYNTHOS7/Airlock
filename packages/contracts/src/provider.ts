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

export const DisputeStatusEnum = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;

export type DisputeStatus = (typeof DisputeStatusEnum)[keyof typeof DisputeStatusEnum];

export const DisputeInfoSchema = z.object({
  dispute_id: z.string(),
  status: z.string(),
  dispute_amount: MoneySchema.optional(),
  reason: z.string().optional(),
  raw_response: z.unknown().optional(),
});

export type DisputeInfo = z.infer<typeof DisputeInfoSchema>;

export const PayoutCommandSchema = z.object({
  operation_id: z.string(),
  provider_idempotency_key: z.string(),
  recipient_email: z.string().email(),
  amount: MoneySchema,
  note: z.string().optional(),
});

export type PayoutCommand = z.infer<typeof PayoutCommandSchema>;

export const PayoutResultSchema = z.object({
  payout_batch_id: z.string(),
  status: z.string(),
  amount: MoneySchema,
  raw_response: z.unknown().optional(),
});

export type PayoutResult = z.infer<typeof PayoutResultSchema>;

export const InvoiceCommandSchema = z.object({
  operation_id: z.string(),
  recipient_email: z.string().email(),
  amount: MoneySchema,
  invoice_number: z.string().optional(),
  description: z.string().optional(),
});

export type InvoiceCommand = z.infer<typeof InvoiceCommandSchema>;

export const InvoiceResultSchema = z.object({
  invoice_id: z.string(),
  status: z.string(),
  amount: MoneySchema,
  raw_response: z.unknown().optional(),
});

export type InvoiceResult = z.infer<typeof InvoiceResultSchema>;

export const WebhookVerifyParamsSchema = z.object({
  auth_algo: z.string(),
  cert_url: z.string(),
  transmission_id: z.string(),
  transmission_sig: z.string(),
  transmission_time: z.string(),
  webhook_id: z.string(),
  webhook_event: z.unknown(),
});

export type WebhookVerifyParams = z.infer<typeof WebhookVerifyParamsSchema>;

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

  /**
   * Inquires whether a transaction is subject to an active dispute or chargeback.
   */
  getDispute?(transactionId: string): Promise<DisputeInfo | null>;

  /**
   * Dispatches an autonomous agent merchant payout (e.g., supplier fulfillment or affiliate debit).
   */
  payout?(cmd: PayoutCommand): Promise<PayoutResult>;

  /**
   * Generates a PayPal business invoice for agent-assisted sales.
   */
  createInvoice?(cmd: InvoiceCommand): Promise<InvoiceResult>;

  /**
   * Verifies authenticity of an incoming PayPal Webhook event signature.
   */
  verifyWebhookSignature?(params: WebhookVerifyParams): Promise<boolean>;
}

