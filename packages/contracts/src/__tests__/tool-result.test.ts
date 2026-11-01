import { describe, it, expect } from 'vitest';
import {
  ToolResultSchema,
  ToolStatusEnum,
  type ToolResult,
} from '../tool-result.js';
import { DispositionEnum } from '../disposition.js';
import { OperationStateEnum } from '../state-machine.js';

describe('Contracts: ToolResult', () => {
  it('validates a successful ToolResult with evidence and state', () => {
    const result: ToolResult = {
      status: ToolStatusEnum.SUCCESS,
      reason: 'Refund executed and verified against PayPal Sandbox',
      evidence_refs: ['ev_refund_9RN123', 'ev_capture_CAP80W'],
      operation_id: 'op_test_123',
      state: OperationStateEnum.SUCCEEDED,
      disposition: DispositionEnum.ALLOW,
      data: {
        refund_id: 'REF-9RN123',
        amount_minor: 2000,
      },
    };

    const parsed = ToolResultSchema.parse(result);
    expect(parsed.status).toBe(ToolStatusEnum.SUCCESS);
    expect(parsed.evidence_refs).toHaveLength(2);
    expect(parsed.operation_id).toBe('op_test_123');
  });

  it('validates an approval required ToolResult', () => {
    const result: ToolResult = {
      status: ToolStatusEnum.REQUIRES_APPROVAL,
      reason: 'Refund amount $150.00 USD exceeds the auto-approval threshold of $50.00 USD',
      evidence_refs: [],
      operation_id: 'op_test_456',
      state: OperationStateEnum.AWAITING_APPROVAL,
      disposition: DispositionEnum.REQUIRE_APPROVAL,
    };

    const parsed = ToolResultSchema.parse(result);
    expect(parsed.status).toBe(ToolStatusEnum.REQUIRES_APPROVAL);
  });
});

