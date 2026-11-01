import { z } from 'zod';
import { DispositionSchema } from './disposition.js';
import { OperationStateSchema } from './state-machine.js';

export const ToolStatusEnum = {
  SUCCESS: 'SUCCESS',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  PAUSED_FOR_REVIEW: 'PAUSED_FOR_REVIEW',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
} as const;

export type ToolStatus = (typeof ToolStatusEnum)[keyof typeof ToolStatusEnum];

export const ToolStatusSchema = z.enum([
  ToolStatusEnum.SUCCESS,
  ToolStatusEnum.REQUIRES_APPROVAL,
  ToolStatusEnum.PAUSED_FOR_REVIEW,
  ToolStatusEnum.BLOCKED,
  ToolStatusEnum.FAILED,
  ToolStatusEnum.OUTCOME_UNKNOWN,
]);

/**
 * Standard structured result returned by all Airlock MCP tools.
 */
export const ToolResultSchema = z.object({
  status: ToolStatusSchema,
  reason: z.string(),
  evidence_refs: z.array(z.string()).default([]),
  operation_id: z.string(),
  state: OperationStateSchema.optional(),
  disposition: DispositionSchema.optional(),
  data: z.unknown().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

