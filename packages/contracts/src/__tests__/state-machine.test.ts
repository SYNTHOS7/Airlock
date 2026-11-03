import { describe, it, expect } from 'vitest';
import {
  OperationStateEnum,
  type OperationState,
  transition,
  canTransition,
  isTerminalState,
  IllegalStateTransitionError,
  ALLOWED_TRANSITIONS,
  TERMINAL_STATES,
} from '../state-machine.js';

describe('State Machine: Guarded Operation Lifecycle', () => {
  describe('Allowed transitions (Spec Part II Section 9)', () => {
    it('allows RECEIVED -> VALIDATING', () => {
      expect(canTransition(OperationStateEnum.RECEIVED, OperationStateEnum.VALIDATING)).toBe(true);
      expect(transition(OperationStateEnum.RECEIVED, OperationStateEnum.VALIDATING)).toBe(
        OperationStateEnum.VALIDATING
      );
    });

    it('allows VALIDATING -> REJECTED and VALIDATING -> EVALUATING', () => {
      expect(canTransition(OperationStateEnum.VALIDATING, OperationStateEnum.REJECTED)).toBe(true);
      expect(transition(OperationStateEnum.VALIDATING, OperationStateEnum.REJECTED)).toBe(
        OperationStateEnum.REJECTED
      );

      expect(canTransition(OperationStateEnum.VALIDATING, OperationStateEnum.EVALUATING)).toBe(true);
      expect(transition(OperationStateEnum.VALIDATING, OperationStateEnum.EVALUATING)).toBe(
        OperationStateEnum.EVALUATING
      );
    });

    it('allows EVALUATING -> DENIED, NEEDS_REVIEW, AWAITING_APPROVAL, and READY', () => {
      const allowedFromEvaluating: OperationState[] = [
        OperationStateEnum.DENIED,
        OperationStateEnum.NEEDS_REVIEW,
        OperationStateEnum.AWAITING_APPROVAL,
        OperationStateEnum.READY,
      ];

      for (const target of allowedFromEvaluating) {
        expect(canTransition(OperationStateEnum.EVALUATING, target)).toBe(true);
        expect(transition(OperationStateEnum.EVALUATING, target)).toBe(target);
      }
    });

    it('allows AWAITING_APPROVAL -> DENIED and AWAITING_APPROVAL -> READY', () => {
      expect(canTransition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.DENIED)).toBe(true);
      expect(transition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.DENIED)).toBe(
        OperationStateEnum.DENIED
      );

      expect(canTransition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.READY)).toBe(true);
      expect(transition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.READY)).toBe(
        OperationStateEnum.READY
      );
    });

    it('allows READY -> EXECUTING and READY -> DENIED (precheck failure)', () => {
      expect(canTransition(OperationStateEnum.READY, OperationStateEnum.EXECUTING)).toBe(true);
      expect(transition(OperationStateEnum.READY, OperationStateEnum.EXECUTING)).toBe(
        OperationStateEnum.EXECUTING
      );

      expect(canTransition(OperationStateEnum.READY, OperationStateEnum.DENIED)).toBe(true);
      expect(transition(OperationStateEnum.READY, OperationStateEnum.DENIED)).toBe(
        OperationStateEnum.DENIED
      );
    });

    it('allows EXECUTING -> SUCCEEDED, FAILED, and OUTCOME_UNKNOWN', () => {
      const targets: OperationState[] = [
        OperationStateEnum.SUCCEEDED,
        OperationStateEnum.FAILED,
        OperationStateEnum.OUTCOME_UNKNOWN,
      ];
      for (const target of targets) {
        expect(canTransition(OperationStateEnum.EXECUTING, target)).toBe(true);
        expect(transition(OperationStateEnum.EXECUTING, target)).toBe(target);
      }
    });

    it('allows OUTCOME_UNKNOWN -> VERIFYING only', () => {
      expect(canTransition(OperationStateEnum.OUTCOME_UNKNOWN, OperationStateEnum.VERIFYING)).toBe(true);
      expect(transition(OperationStateEnum.OUTCOME_UNKNOWN, OperationStateEnum.VERIFYING)).toBe(
        OperationStateEnum.VERIFYING
      );
    });

    it('allows VERIFYING -> SUCCEEDED, FAILED, VERIFYING (pending), and NEEDS_REVIEW', () => {
      const targets: OperationState[] = [
        OperationStateEnum.SUCCEEDED,
        OperationStateEnum.FAILED,
        OperationStateEnum.VERIFYING,
        OperationStateEnum.NEEDS_REVIEW,
      ];
      for (const target of targets) {
        expect(canTransition(OperationStateEnum.VERIFYING, target)).toBe(true);
        expect(transition(OperationStateEnum.VERIFYING, target)).toBe(target);
      }
    });

    it('CRITICAL INVARIANT: FAILED only transitions to EVALUATING (full re-evaluation)', () => {
      expect(canTransition(OperationStateEnum.FAILED, OperationStateEnum.EVALUATING)).toBe(true);
      expect(transition(OperationStateEnum.FAILED, OperationStateEnum.EVALUATING)).toBe(
        OperationStateEnum.EVALUATING
      );
    });

    it('iterates through all mapped transitions in ALLOWED_TRANSITIONS table', () => {
      for (const [from, allowed] of Object.entries(ALLOWED_TRANSITIONS)) {
        for (const to of allowed) {
          expect(canTransition(from as OperationState, to)).toBe(true);
          expect(transition(from as OperationState, to)).toBe(to);
        }
      }
    });
  });

  describe('Forbidden transitions and fail-closed protections', () => {
    it('FORBIDDEN: FAILED -> READY must throw (must go back through EVALUATING)', () => {
      expect(canTransition(OperationStateEnum.FAILED, OperationStateEnum.READY)).toBe(false);
      expect(() => transition(OperationStateEnum.FAILED, OperationStateEnum.READY)).toThrow(
        IllegalStateTransitionError
      );
    });

    it('FORBIDDEN: FAILED -> EXECUTING must throw', () => {
      expect(canTransition(OperationStateEnum.FAILED, OperationStateEnum.EXECUTING)).toBe(false);
      expect(() => transition(OperationStateEnum.FAILED, OperationStateEnum.EXECUTING)).toThrow(
        IllegalStateTransitionError
      );
    });

    it('FORBIDDEN: OUTCOME_UNKNOWN -> SUCCEEDED must throw (cannot bypass verification)', () => {
      expect(canTransition(OperationStateEnum.OUTCOME_UNKNOWN, OperationStateEnum.SUCCEEDED)).toBe(false);
      expect(() => transition(OperationStateEnum.OUTCOME_UNKNOWN, OperationStateEnum.SUCCEEDED)).toThrow(
        IllegalStateTransitionError
      );
    });

    it('FORBIDDEN: RECEIVED cannot skip straight to READY or SUCCEEDED', () => {
      expect(canTransition(OperationStateEnum.RECEIVED, OperationStateEnum.READY)).toBe(false);
      expect(canTransition(OperationStateEnum.RECEIVED, OperationStateEnum.SUCCEEDED)).toBe(false);
      expect(() => transition(OperationStateEnum.RECEIVED, OperationStateEnum.SUCCEEDED)).toThrow(
        IllegalStateTransitionError
      );
    });

    it('FORBIDDEN: AWAITING_APPROVAL cannot skip directly to EXECUTING', () => {
      expect(canTransition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.EXECUTING)).toBe(false);
      expect(() =>
        transition(OperationStateEnum.AWAITING_APPROVAL, OperationStateEnum.EXECUTING)
      ).toThrow(IllegalStateTransitionError);
    });

    it('FORBIDDEN: EXECUTING cannot rewind to READY', () => {
      expect(canTransition(OperationStateEnum.EXECUTING, OperationStateEnum.READY)).toBe(false);
      expect(() => transition(OperationStateEnum.EXECUTING, OperationStateEnum.READY)).toThrow(
        IllegalStateTransitionError
      );
    });

    it('Terminal states cannot transition to any other state', () => {
      const allStates = Object.values(OperationStateEnum);
      for (const terminalState of TERMINAL_STATES) {
        expect(isTerminalState(terminalState)).toBe(true);
        for (const target of allStates) {
          expect(canTransition(terminalState, target)).toBe(false);
          expect(() => transition(terminalState, target)).toThrow(IllegalStateTransitionError);
        }
      }
    });

    it('attaches transition metadata and context to IllegalStateTransitionError', () => {
      try {
        transition(OperationStateEnum.RECEIVED, OperationStateEnum.EXECUTING, 'unit-test-context');
        expect.unreachable('Should have thrown IllegalStateTransitionError');
      } catch (err) {
        expect(err).toBeInstanceOf(IllegalStateTransitionError);
        const error = err as IllegalStateTransitionError;
        expect(error.fromState).toBe(OperationStateEnum.RECEIVED);
        expect(error.toState).toBe(OperationStateEnum.EXECUTING);
        expect(error.allowedTransitions).toEqual([OperationStateEnum.VALIDATING]);
        expect(error.message).toContain('unit-test-context');
      }
    });
  });
});

