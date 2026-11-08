import {
  type ProviderAdapter,
  type RefundCommand,
  type RefundResult,
  type CaptureInfo,
  type ProviderType,
  ProviderTypeEnum,
  ProviderRefundStatusEnum,
  createMoney,
  subtractMoney,
  toDecimalString,
} from '@airlock/contracts';
import { PayPalHttpClient, type PayPalClientConfig } from './client.js';

export class PayPalSandboxAdapter implements ProviderAdapter {
  public readonly providerName: ProviderType = ProviderTypeEnum.PAYPAL_SANDBOX;
  private client: PayPalHttpClient;

  constructor(config: PayPalClientConfig = {}) {
    this.client = new PayPalHttpClient(config);
  }

  public isConfigured(): boolean {
    return this.client.isConfigured();
  }

  /**
   * Dispatches a refund to PayPal Sandbox (Day 5 Block 2).
   * Headers: PayPal-Request-Id (stable provider idempotency key)
   * Payload: custom_id (operation_id), amount (value + currency_code)
   */
  public async refund(cmd: RefundCommand): Promise<RefundResult> {
    const body: Record<string, unknown> = {
      custom_id: cmd.operation_id,
    };

    if (cmd.amount) {
      body.amount = {
        value: toDecimalString(cmd.amount),
        currency_code: cmd.amount.currency,
      };
    }

    if (cmd.reason) {
      body.note_to_payer = cmd.reason.slice(0, 255);
    }

    const { data } = await this.client.request<any>(
      `/v2/payments/captures/${cmd.capture_id}/refund`,
      {
        method: 'POST',
        requestId: cmd.provider_idempotency_key,
        body,
      }
    );

    const currency = data.amount?.currency_code || cmd.amount?.currency || 'USD';
    const amountMinor = data.amount?.value ? Math.round(parseFloat(data.amount.value) * 100) : (cmd.amount?.amount_minor ?? 0);

    return {
      provider_refund_id: data.id,
      status: this.mapRefundStatus(data.status),
      amount: createMoney(amountMinor / 100, currency),
      custom_id: data.custom_id,
      raw_response: data,
    };
  }

  /**
   * Retrieves refund details by ID.
   */
  public async getRefund(refundId: string): Promise<RefundResult> {
    const { data } = await this.client.request<any>(`/v2/payments/refunds/${refundId}`);
    const currency = data.amount?.currency_code || 'USD';
    const amountMinor = data.amount?.value ? Math.round(parseFloat(data.amount.value) * 100) : 0;

    return {
      provider_refund_id: data.id,
      status: this.mapRefundStatus(data.status),
      amount: createMoney(amountMinor / 100, currency),
      custom_id: data.custom_id,
      raw_response: data,
    };
  }

  /**
   * Retrieves capture details including cumulative refunded amount and remaining balance.
   */
  public async getCapture(captureId: string): Promise<CaptureInfo> {
    const { data } = await this.client.request<any>(`/v2/payments/captures/${captureId}`);

    const currency = data.amount?.currency_code || 'USD';
    const totalMinor = Math.round(parseFloat(data.amount?.value || '0') * 100);
    const totalAmount = createMoney(totalMinor / 100, currency);

    const refundedValue = data.seller_receivable_breakdown?.refunded_amount?.value || '0.00';
    const refundedMinor = Math.round(parseFloat(refundedValue) * 100);
    const refundedAmount = createMoney(refundedMinor / 100, currency);

    const remainingAmount = subtractMoney(totalAmount, refundedAmount);

    return {
      capture_id: data.id,
      status: data.status,
      amount: totalAmount,
      refunded_amount: refundedAmount,
      remaining_refundable_amount: remainingAmount,
      raw_response: data,
    };
  }

  /**
   * Inquires whether a transaction is subject to an active dispute on PayPal.
   */
  public async getDispute(transactionId: string): Promise<any | null> {
    try {
      const { data } = await this.client.request<any>(
        `/v1/customer/disputes?disputed_transaction_id=${transactionId}`
      );
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          dispute_id: item.dispute_id,
          status: item.status,
          reason: item.reason,
          dispute_amount: item.dispute_amount ? createMoney(parseFloat(item.dispute_amount.value), item.dispute_amount.currency_code) : undefined,
          raw_response: item,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Dispatches an autonomous payout via PayPal Payouts API.
   */
  public async payout(cmd: any): Promise<any> {
    const { data } = await this.client.request<any>(`/v1/payments/payouts`, {
      method: 'POST',
      requestId: cmd.provider_idempotency_key,
      body: {
        sender_batch_header: {
          sender_batch_id: cmd.operation_id,
          email_subject: 'Payout from Airlock Gateway',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: toDecimalString(cmd.amount),
              currency: cmd.amount.currency,
            },
            note: cmd.note || 'Airlock Automated Disbursement',
            sender_item_id: cmd.operation_id,
            receiver: cmd.recipient_email,
          },
        ],
      },
    });

    return {
      payout_batch_id: data.batch_header?.payout_batch_id || data.id,
      status: data.batch_header?.batch_status || 'PENDING',
      amount: cmd.amount,
      raw_response: data,
    };
  }

  /**
   * Creates a PayPal invoice for agentic commerce billing.
   */
  public async createInvoice(cmd: any): Promise<any> {
    const { data } = await this.client.request<any>(`/v2/invoicing/invoices`, {
      method: 'POST',
      body: {
        detail: {
          invoice_number: cmd.invoice_number,
          currency_code: cmd.amount.currency,
          note: cmd.description,
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: cmd.recipient_email,
            },
          },
        ],
        items: [
          {
            name: cmd.description || 'Agentic Service',
            quantity: '1',
            unit_amount: {
              currency_code: cmd.amount.currency,
              value: toDecimalString(cmd.amount),
            },
          },
        ],
      },
    });

    return {
      invoice_id: data.id,
      status: data.status || 'DRAFT',
      amount: cmd.amount,
      raw_response: data,
    };
  }

  /**
   * Verifies authenticity of an incoming PayPal Webhook event signature.
   */
  public async verifyWebhookSignature(params: any): Promise<boolean> {
    try {
      const { data } = await this.client.request<any>(
        `/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          body: params,
        }
      );
      return data.verification_status === 'SUCCESS';
    } catch {
      return false;
    }
  }

  private mapRefundStatus(status: string): any {
    switch (status) {
      case 'COMPLETED':
        return ProviderRefundStatusEnum.COMPLETED;
      case 'PENDING':
        return ProviderRefundStatusEnum.PENDING;
      case 'FAILED':
        return ProviderRefundStatusEnum.FAILED;
      case 'CANCELLED':
        return ProviderRefundStatusEnum.CANCELLED;
      default:
        return status;
    }
  }
}

