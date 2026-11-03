import {
  type ProviderAdapter,
  type RefundCommand,
  type RefundResult,
  type CaptureInfo,
  type ProviderType,
  ProviderTypeEnum,
  ProviderRefundStatusEnum,
  type Money,
  createMoney,
  addMoney,
  subtractMoney,
  compareMoney,
} from '@airlock/contracts';
import { randomUUID } from 'node:crypto';

export type MockAdapterMode =
  | 'success'
  | 'declined'
  | 'pending_then_complete'
  | 'timeout_not_executed'
  | 'timeout_but_executed';

export interface MockCaptureState {
  capture_id: string;
  status: 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  original_amount: Money;
  refunded_amount: Money;
}

export interface MockIdempotencyEntry {
  key: string;
  command: RefundCommand;
  result: RefundResult;
}

/**
 * Deterministic Mock Adapter for Airlock.
 * 
 * Implements ProviderAdapter and mirrors empirical behaviors recorded in docs/spike-notes.md:
 * - Exp 3: Same-key replay with identical payload returns the cached refund (safe idempotency).
 * - Exp 4: Same-key replay with mismatched payload throws IDEMPOTENCY_PARAMETERS_MISMATCH.
 * - Exp 5: New key with same amount issues a new refund if remaining balance permits.
 * - Exp 7: Over-refund or refund of fully refunded capture throws CAPTURE_FULLY_REFUNDED.
 */
export class MockProviderAdapter implements ProviderAdapter {
  public readonly providerName: ProviderType = ProviderTypeEnum.MOCK;

  private captures: Map<string, MockCaptureState> = new Map();
  private refunds: Map<string, RefundResult> = new Map();
  private idempotencyCache: Map<string, MockIdempotencyEntry> = new Map();

  constructor(public mode: MockAdapterMode = 'success') {
    this.seedDefaultCaptures();
  }

  /**
   * Seeds default captures for testing.
   */
  public seedDefaultCaptures(): void {
    this.seedCapture('CAP-DEFAULT-100', createMoney(100.0, 'USD'));
    this.seedCapture('CAP-SMALL-20', createMoney(20.0, 'USD'));
    this.seedCapture('CAP-LARGE-500', createMoney(500.0, 'USD'));
  }

  public seedCapture(capture_id: string, amount: Money): void {
    this.captures.set(capture_id, {
      capture_id,
      status: 'COMPLETED',
      original_amount: amount,
      refunded_amount: createMoney(0, amount.currency),
    });
  }

  public setMode(mode: MockAdapterMode): void {
    this.mode = mode;
  }

  public async refund(cmd: RefundCommand): Promise<RefundResult> {
    // 1. Check Idempotency Key Replay (Spike Notes Exp 3 & 4)
    const existingEntry = this.idempotencyCache.get(cmd.provider_idempotency_key);
    if (existingEntry) {
      // Check for parameter mismatch (Exp 4)
      const existingMinor = existingEntry.command.amount?.amount_minor;
      const incomingMinor = cmd.amount?.amount_minor;
      if (existingMinor !== incomingMinor) {
        throw new Error(
          JSON.stringify({
            name: 'UNPROCESSABLE_ENTITY',
            issue: 'IDEMPOTENCY_PARAMETERS_MISMATCH',
            message: 'Payload does not match the previous request for this idempotency key (docs/spike-notes.md Exp 4)',
          })
        );
      }
      // Identical replay -> return existing refund without deducting again (Exp 3)
      return existingEntry.result;
    }

    // 2. Fetch capture
    const capture = this.captures.get(cmd.capture_id);
    if (!capture) {
      throw new Error(`Capture not found: ${cmd.capture_id}`);
    }

    const remaining = subtractMoney(capture.original_amount, capture.refunded_amount);
    const refundAmount = cmd.amount ?? remaining;

    // 3. Check remaining refundable balance (Exp 7)
    if (compareMoney(refundAmount, remaining) > 0) {
      throw new Error(
        JSON.stringify({
          name: 'UNPROCESSABLE_ENTITY',
          issue: 'CAPTURE_FULLY_REFUNDED',
          message: 'Requested refund amount exceeds remaining refundable capture amount (docs/spike-notes.md Exp 7)',
        })
      );
    }

    // 4. Handle Mock Modes
    if (this.mode === 'timeout_not_executed') {
      // Network dropped BEFORE provider processed anything
      throw new Error('ETIMEDOUT: Connection to provider timed out before execution.');
    }

    if (this.mode === 'declined') {
      const failedResult: RefundResult = {
        provider_refund_id: `REF-DECLINED-${randomUUID().slice(0, 8)}`,
        status: ProviderRefundStatusEnum.FAILED,
        amount: refundAmount,
        custom_id: cmd.operation_id,
      };
      this.refunds.set(failedResult.provider_refund_id, failedResult);
      return failedResult;
    }

    // Deduct from capture state
    capture.refunded_amount = addMoney(capture.refunded_amount, refundAmount);
    const remainingAfter = subtractMoney(capture.original_amount, capture.refunded_amount);
    capture.status = remainingAfter.amount_minor === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const refundId = `REF-MOCK-${randomUUID().slice(0, 8)}`;
    const status =
      this.mode === 'pending_then_complete'
        ? ProviderRefundStatusEnum.PENDING
        : ProviderRefundStatusEnum.COMPLETED;

    const result: RefundResult = {
      provider_refund_id: refundId,
      status,
      amount: refundAmount,
      custom_id: cmd.operation_id,
      raw_response: {
        id: refundId,
        status,
        custom_id: cmd.operation_id,
        capture_id: cmd.capture_id,
        amount: {
          value: (refundAmount.amount_minor / 100).toFixed(2),
          currency_code: refundAmount.currency,
        },
      },
    };

    // Cache refund and idempotency entry
    this.refunds.set(refundId, result);
    this.idempotencyCache.set(cmd.provider_idempotency_key, {
      key: cmd.provider_idempotency_key,
      command: cmd,
      result,
    });

    if (this.mode === 'timeout_but_executed') {
      // LOST RESPONSE (Spike Hard Case): Provider acted, but caller got a timeout error
      throw new Error('ETIMEDOUT: Provider executed refund, but response was lost in transit (lost response simulation).');
    }

    return result;
  }

  public async getRefund(refundId: string): Promise<RefundResult> {
    const refund = this.refunds.get(refundId);
    if (!refund) {
      throw new Error(`Refund not found: ${refundId}`);
    }

    // If pending_then_complete, lookup transitions to COMPLETED
    if (refund.status === ProviderRefundStatusEnum.PENDING && this.mode === 'pending_then_complete') {
      refund.status = ProviderRefundStatusEnum.COMPLETED;
    }

    return { ...refund };
  }

  public async getCapture(captureId: string): Promise<CaptureInfo> {
    const capture = this.captures.get(captureId);
    if (!capture) {
      throw new Error(`Capture not found: ${captureId}`);
    }

    const remaining = subtractMoney(capture.original_amount, capture.refunded_amount);

    return {
      capture_id: capture.capture_id,
      status: capture.status,
      amount: capture.original_amount,
      refunded_amount: capture.refunded_amount,
      remaining_refundable_amount: remaining,
    };
  }

  public getRefunds(): RefundResult[] {
    return Array.from(this.refunds.values());
  }

  public getRefundsForCapture(captureId: string): RefundResult[] {
    return Array.from(this.refunds.values()).filter(
      (r) => (r.raw_response as any)?.capture_id === captureId
    );
  }
}

