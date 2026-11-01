import { describe, it, expect, beforeEach } from 'vitest';
import { MockProviderAdapter } from '../mock-adapter.js';
import { createMoney, ProviderRefundStatusEnum } from '@airlock/contracts';

describe('MockProviderAdapter: Verified Behavioral Conformance', () => {
  let adapter: MockProviderAdapter;

  beforeEach(() => {
    adapter = new MockProviderAdapter('success');
  });

  it('executes a baseline refund and decrements remaining capture balance', async () => {
    const initialCapture = await adapter.getCapture('CAP-DEFAULT-100');
    expect(initialCapture.remaining_refundable_amount.amount_minor).toBe(10000);

    const result = await adapter.refund({
      operation_id: 'op_mock_1',
      provider_idempotency_key: 'idemp_key_1',
      capture_id: 'CAP-DEFAULT-100',
      amount: createMoney(30.0, 'USD'),
    });

    expect(result.status).toBe(ProviderRefundStatusEnum.COMPLETED);
    expect(result.custom_id).toBe('op_mock_1');
    expect(result.amount.amount_minor).toBe(3000);

    const updatedCapture = await adapter.getCapture('CAP-DEFAULT-100');
    expect(updatedCapture.refunded_amount.amount_minor).toBe(3000);
    expect(updatedCapture.remaining_refundable_amount.amount_minor).toBe(7000);
  });

  it('Spike Exp 3: returns identical refund on replay with same key without second deduction', async () => {
    const cmd = {
      operation_id: 'op_mock_replay',
      provider_idempotency_key: 'idemp_key_replay',
      capture_id: 'CAP-DEFAULT-100',
      amount: createMoney(25.0, 'USD'),
    };

    const res1 = await adapter.refund(cmd);
    const res2 = await adapter.refund(cmd);

    expect(res1.provider_refund_id).toBe(res2.provider_refund_id);
    const capture = await adapter.getCapture('CAP-DEFAULT-100');
    expect(capture.refunded_amount.amount_minor).toBe(2500); // Only deducted once!
  });

  it('Spike Exp 4: throws IDEMPOTENCY_PARAMETERS_MISMATCH when same key is reused with different amount', async () => {
    await adapter.refund({
      operation_id: 'op_mock_mismatch',
      provider_idempotency_key: 'idemp_key_same',
      capture_id: 'CAP-DEFAULT-100',
      amount: createMoney(20.0, 'USD'),
    });

    await expect(
      adapter.refund({
        operation_id: 'op_mock_mismatch',
        provider_idempotency_key: 'idemp_key_same',
        capture_id: 'CAP-DEFAULT-100',
        amount: createMoney(40.0, 'USD'), // Changed amount
      })
    ).rejects.toThrow(/IDEMPOTENCY_PARAMETERS_MISMATCH/);
  });

  it('Spike Exp 7: rejects refund exceeding remaining balance with CAPTURE_FULLY_REFUNDED', async () => {
    await expect(
      adapter.refund({
        operation_id: 'op_mock_overlimit',
        provider_idempotency_key: 'idemp_key_over',
        capture_id: 'CAP-SMALL-20', // Has $20.00
        amount: createMoney(25.0, 'USD'), // Requests $25.00
      })
    ).rejects.toThrow(/CAPTURE_FULLY_REFUNDED/);
  });

  it('handles timeout_not_executed: throws timeout and does not touch capture balance', async () => {
    adapter.setMode('timeout_not_executed');

    await expect(
      adapter.refund({
        operation_id: 'op_mock_tout',
        provider_idempotency_key: 'idemp_key_tout',
        capture_id: 'CAP-DEFAULT-100',
        amount: createMoney(20.0, 'USD'),
      })
    ).rejects.toThrow(/Connection to provider timed out/);

    const capture = await adapter.getCapture('CAP-DEFAULT-100');
    expect(capture.refunded_amount.amount_minor).toBe(0);
  });

  it('handles timeout_but_executed (Lost Response): provider executes action, caller times out, subsequent replay recovers result', async () => {
    adapter.setMode('timeout_but_executed');

    const cmd = {
      operation_id: 'op_lost_resp',
      provider_idempotency_key: 'idemp_lost_resp',
      capture_id: 'CAP-DEFAULT-100',
      amount: createMoney(15.0, 'USD'),
    };

    // First call throws timeout
    await expect(adapter.refund(cmd)).rejects.toThrow(/response was lost in transit/);

    // Capture balance WAS updated
    const capture = await adapter.getCapture('CAP-DEFAULT-100');
    expect(capture.refunded_amount.amount_minor).toBe(1500);

    // Switch mode back to success to simulate replay recovery
    adapter.setMode('success');
    const recovered = await adapter.refund(cmd);
    expect(recovered.custom_id).toBe('op_lost_resp');
    expect(recovered.amount.amount_minor).toBe(1500);
  });

  it('handles pending_then_complete: initial status PENDING, lookup returns COMPLETED', async () => {
    adapter.setMode('pending_then_complete');

    const result = await adapter.refund({
      operation_id: 'op_pending',
      provider_idempotency_key: 'idemp_pending',
      capture_id: 'CAP-DEFAULT-100',
      amount: createMoney(10.0, 'USD'),
    });

    expect(result.status).toBe(ProviderRefundStatusEnum.PENDING);

    const lookup = await adapter.getRefund(result.provider_refund_id);
    expect(lookup.status).toBe(ProviderRefundStatusEnum.COMPLETED);
  });
});

