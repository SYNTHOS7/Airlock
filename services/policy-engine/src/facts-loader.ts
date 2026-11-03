import {
  type ProviderAdapter,
  type Money,
  fromMinor,
  addMoney,
  OperationStateEnum,
} from '@airlock/contracts';
import type { AirlockRepository, OperationRecord } from '@airlock/storage';
import type { PolicyFacts, PolicyConfig, CallerRole } from './types.js';

export interface LoadFactsParams {
  caller_id: string;
  payment_id: string;
  repository: AirlockRepository;
  adapter: ProviderAdapter;
  config: PolicyConfig;
  caller_roles?: CallerRole[];
  current_operation_id?: string;
}

/**
 * Loads trusted operational facts from storage and provider adapter (FR-4).
 * Strictly isolated from the pure policy evaluation function.
 */
export async function loadPolicyFacts(params: {
  caller_id: string;
  payment_id: string;
  repository: AirlockRepository;
  adapter: ProviderAdapter;
  config: PolicyConfig;
  caller_roles?: CallerRole[];
  current_operation_id?: string;
}): Promise<PolicyFacts> {
  const { caller_id, payment_id, repository, adapter, config, caller_roles, current_operation_id } = params;

  // 1. Fetch live or mock capture state from adapter
  const capture = await adapter.getCapture(payment_id);
  const currency = capture.amount.currency;

  // 2. Fetch all local operations associated with this capture/payment
  const operations: OperationRecord[] = repository.listOperationsForPayment(payment_id);

  let completedMinor = 0;
  let inflightMinor = 0;
  let priorAttemptState: any = null;

  for (const op of operations) {
    // Exclude current operation from prior inflight/completed counts to prevent double-counting
    if (current_operation_id && op.operation_id === current_operation_id) {
      continue;
    }

    const minor = op.amount?.amount_minor ?? 0;

    if (op.state === OperationStateEnum.SUCCEEDED) {
      completedMinor += minor;
    } else if (
      op.state === OperationStateEnum.EXECUTING ||
      op.state === OperationStateEnum.READY ||
      op.state === OperationStateEnum.AWAITING_APPROVAL
    ) {
      inflightMinor += minor;
    }

    if (op.state === OperationStateEnum.OUTCOME_UNKNOWN) {
      priorAttemptState = OperationStateEnum.OUTCOME_UNKNOWN;
    }
  }

  // 3. Count recent requests by caller within window (for velocity checks)
  const callerRecentCount = repository.countRecentOperationsForRequester(
    caller_id,
    config.velocity_window_seconds
  );

  return {
    caller_id,
    caller_roles: caller_roles ?? ['support_agent'],
    payment_capture_status: capture.status,
    remaining_refundable_amount: capture.remaining_refundable_amount,
    completed_refunds_total: fromMinor(completedMinor, currency),
    inflight_refunds_total: fromMinor(inflightMinor, currency),
    caller_recent_refunds_count: callerRecentCount,
    prior_attempt_state: priorAttemptState,
  };
}

