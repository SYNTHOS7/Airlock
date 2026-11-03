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

