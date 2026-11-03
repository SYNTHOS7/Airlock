import { z } from 'zod';

/**
 * OperationState represents the complete guarded lifecycle of an Airlock operation.
 */
export const OperationStateEnum = {
  RECEIVED: 'RECEIVED',
  VALIDATING: 'VALIDATING',
  REJECTED: 'REJECTED',
  EVALUATING: 'EVALUATING',
  DENIED: 'DENIED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN',
  VERIFYING: 'VERIFYING',
} as const;

export type OperationState = (typeof OperationStateEnum)[keyof typeof OperationStateEnum];

export const OperationStateSchema = z.enum([
  OperationStateEnum.RECEIVED,
  OperationStateEnum.VALIDATING,
  OperationStateEnum.REJECTED,
  OperationStateEnum.EVALUATING,
  OperationStateEnum.DENIED,
  OperationStateEnum.NEEDS_REVIEW,
  OperationStateEnum.AWAITING_APPROVAL,
  OperationStateEnum.READY,
  OperationStateEnum.EXECUTING,
  OperationStateEnum.SUCCEEDED,
  OperationStateEnum.FAILED,
  OperationStateEnum.OUTCOME_UNKNOWN,
  OperationStateEnum.VERIFYING,
]);

/**
 * Terminal states where no further automated lifecycle transitions occur.
 */
export const TERMINAL_STATES: ReadonlySet<OperationState> = new Set([
  OperationStateEnum.REJECTED,
  OperationStateEnum.DENIED,
  OperationStateEnum.SUCCEEDED,
  OperationStateEnum.NEEDS_REVIEW,
]);

/**
 * Formal transition table matching the Airlock State Diagram.
 * Note: FAILED only returns to EVALUATING (full re-evaluation), never directly to READY.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<OperationState, readonly OperationState[]>> = {
  [OperationStateEnum.RECEIVED]: [OperationStateEnum.VALIDATING],
  [OperationStateEnum.VALIDATING]: [OperationStateEnum.REJECTED, OperationStateEnum.EVALUATING],
  [OperationStateEnum.EVALUATING]: [
    OperationStateEnum.DENIED,
    OperationStateEnum.NEEDS_REVIEW,
    OperationStateEnum.AWAITING_APPROVAL,
    OperationStateEnum.READY,
  ],
  [OperationStateEnum.AWAITING_APPROVAL]: [OperationStateEnum.DENIED, OperationStateEnum.READY],
  [OperationStateEnum.READY]: [OperationStateEnum.EXECUTING, OperationStateEnum.DENIED],
  [OperationStateEnum.EXECUTING]: [
    OperationStateEnum.SUCCEEDED,
    OperationStateEnum.FAILED,
    OperationStateEnum.OUTCOME_UNKNOWN,
  ],
  [OperationStateEnum.OUTCOME_UNKNOWN]: [OperationStateEnum.VERIFYING],
  [OperationStateEnum.VERIFYING]: [
    OperationStateEnum.SUCCEEDED,
    OperationStateEnum.FAILED,
    OperationStateEnum.VERIFYING, // Re-query / PENDING
    OperationStateEnum.NEEDS_REVIEW, // Inconclusive / ambiguous
  ],
  [OperationStateEnum.FAILED]: [OperationStateEnum.EVALUATING], // Retry goes through full evaluation
  [OperationStateEnum.REJECTED]: [],
  [OperationStateEnum.DENIED]: [],
  [OperationStateEnum.SUCCEEDED]: [],
  [OperationStateEnum.NEEDS_REVIEW]: [],
};

/**
 * Error thrown when an invalid or illegal state transition is attempted.
 */
export class IllegalStateTransitionError extends Error {
  public readonly fromState: OperationState;
  public readonly toState: OperationState;
  public readonly allowedTransitions: readonly OperationState[];

  constructor(fromState: OperationState, toState: OperationState, context?: string) {
    const allowed = ALLOWED_TRANSITIONS[fromState] || [];
    const contextMsg = context ? ` [Context: ${context}]` : '';
    super(
      `Illegal operation transition from '${fromState}' to '${toState}'. Allowed transitions: [${allowed.join(', ')}]${contextMsg}`
    );
    this.name = 'IllegalStateTransitionError';
    this.fromState = fromState;
    this.toState = toState;
    this.allowedTransitions = allowed;
    Object.setPrototypeOf(this, IllegalStateTransitionError.prototype);
  }
}

/**
 * Checks whether transitioning from `fromState` to `toState` is permitted.
 */
export function canTransition(fromState: OperationState, toState: OperationState): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * Executes a guarded transition from `fromState` to `toState`.
 * Throws IllegalStateTransitionError if the transition is forbidden.
 */
export function transition(
  fromState: OperationState,
  toState: OperationState,
  context?: string
): OperationState {
  if (!canTransition(fromState, toState)) {
    throw new IllegalStateTransitionError(fromState, toState, context);
  }
  return toState;
}

/**
 * Returns true if the state is terminal.
 */
export function isTerminalState(state: OperationState): boolean {
  return TERMINAL_STATES.has(state);
}

