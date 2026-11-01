import { describe, it, expect } from 'vitest';
import {
  ActionRequestSchema,
  computeParamsFingerprint,
  computeActionHash,
} from '../action-request.js';
import { createMoney } from '../money.js';

describe('Contracts: ActionRequest and Cryptographic Fingerprints', () => {
  const validRequest = {
    request_id: 'req_123e4567_e89b',
    action_type: 'REFUND' as const,
    payment_id: 'CAP-TEST123456',
    amount: createMoney(25.0, 'USD'),
    reason: 'Customer requested refund for delayed shipment',
    requester_id: 'agent_sarah_42',
  };

  it('validates a compliant action request', () => {
    const parsed = ActionRequestSchema.parse(validRequest);
    expect(parsed.request_id).toBe(validRequest.request_id);
    expect(parsed.amount?.amount_minor).toBe(2500);
    expect(parsed.amount?.currency).toBe('USD');
  });

  it('rejects requests with missing required fields', () => {
    expect(() => ActionRequestSchema.parse({ ...validRequest, request_id: '' })).toThrow();
    expect(() => ActionRequestSchema.parse({ ...validRequest, payment_id: '' })).toThrow();
    expect(() => ActionRequestSchema.parse({ ...validRequest, reason: '' })).toThrow();
    expect(() => ActionRequestSchema.parse({ ...validRequest, requester_id: '' })).toThrow();
  });

  it('computes deterministic canonical parameter fingerprints (IDEMP-001 / IDEMP-002)', () => {
    const fp1 = computeParamsFingerprint(validRequest);
    const fp2 = computeParamsFingerprint({ ...validRequest });
    expect(fp1).toBe(fp2);
    expect(typeof fp1).toBe('string');
    expect(fp1.length).toBe(64); // SHA-256 hex length
  });

  it('detects parameter tampering: different amount yields different fingerprint', () => {
    const fp1 = computeParamsFingerprint(validRequest);
    const fpModified = computeParamsFingerprint({
      ...validRequest,
      amount: createMoney(30.0, 'USD'),
    });
    expect(fp1).not.toBe(fpModified);
  });

  it('detects parameter tampering: different reason yields different fingerprint', () => {
    const fp1 = computeParamsFingerprint(validRequest);
    const fpModified = computeParamsFingerprint({
      ...validRequest,
      reason: 'Different injected reason',
    });
    expect(fp1).not.toBe(fpModified);
  });

  it('computes specific action hash for human approval verification', () => {
    const hash1 = computeActionHash({
      operation_id: 'op_001',
      payment_id: 'CAP-TEST123456',
      amount: createMoney(25.0, 'USD'),
      requester_id: 'agent_sarah_42',
      provider: 'paypal_sandbox',
    });

    const hash2 = computeActionHash({
      operation_id: 'op_001',
      payment_id: 'CAP-TEST123456',
      amount: createMoney(25.0, 'USD'),
      requester_id: 'agent_sarah_42',
      provider: 'paypal_sandbox',
    });

    const hashModified = computeActionHash({
      operation_id: 'op_001',
      payment_id: 'CAP-TEST123456',
      amount: createMoney(50.0, 'USD'), // Modified amount
      requester_id: 'agent_sarah_42',
      provider: 'paypal_sandbox',
    });

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashModified);
  });
});

