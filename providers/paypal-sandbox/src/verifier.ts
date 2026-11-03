import {
  type OperationRecord,
  type AirlockRepository,
} from '@airlock/storage';
import {
  type ProviderAdapter,
  OperationStateEnum,
  compareMoney,
} from '@airlock/contracts';

export interface VerificationResult {
  operation_id: string;
  outcome: 'VERIFIED_SUCCESS' | 'VERIFIED_FAILURE' | 'UNRESOLVED';
  status: string;
  provider_reference?: string;
  mismatch_flags: string[];
  reason: string;
  evidence_id?: string;
}

/**
 * Outcome Verifier (FR-13, Day 5 Block 3).
 * 
 * Verifies operations against provider evidence:
 * 1. If provider refund ID is known: inspects refund resource, verifies custom_id, amount, currency.
 * 2. If provider refund ID is unknown (lost response): performs same-key replay with identical
 *    idempotency key and checks capture totals (reconciliation).
 * 3. Enforces MISMATCH-001: flags any discrepancy between request and provider state.
 * 4. Inconclusive outcomes escalate to NEEDS_REVIEW (never blind retry).
 */
export class OutcomeVerifier {
  constructor(
    private repo: AirlockRepository,
    private adapter: ProviderAdapter
  ) {}

  public async verifyOperation(operation_id: string): Promise<VerificationResult> {
    const op = this.repo.getOperation(operation_id);
    if (!op) {
      throw new Error(`Operation '${operation_id}' not found in storage.`);
    }

    const mismatchFlags: string[] = [];

    // Path A: Refund ID is already known
    if (op.provider_operation_id) {
      try {
        const refund = await this.adapter.getRefund(op.provider_operation_id);

        // Check MISMATCH-001 (amount, currency, custom_id)
        if (op.amount && compareMoney(op.amount, refund.amount) !== 0) {
          mismatchFlags.push('AMOUNT_MISMATCH');
        }

        if (refund.custom_id && refund.custom_id !== op.operation_id) {
          mismatchFlags.push('CUSTOM_ID_MISMATCH');
        }

        if (mismatchFlags.length > 0) {
          const evidence = this.repo.recordEvidence({
            operation_id: op.operation_id,
            evidence_type: 'verification_mismatch',
            provider_reference: refund.provider_refund_id,
            observed_status: refund.status,
            outcome: 'UNRESOLVED',
            mismatch_flags: mismatchFlags,
            data: refund,
          });

          this.transitionToNeedsReview(
            op.operation_id,
            op.state,
            `MISMATCH-001: Provider state diverged from request [${mismatchFlags.join(', ')}]`
          );

          return {
            operation_id: op.operation_id,
            outcome: 'UNRESOLVED',
            status: refund.status,
            provider_reference: refund.provider_refund_id,
            mismatch_flags: mismatchFlags,
            reason: `MISMATCH-001: Verification flagged discrepancy [${mismatchFlags.join(', ')}]. Escalated to human review.`,
            evidence_id: evidence.evidence_id,
          };
        }

        if (refund.status === 'COMPLETED') {
          const evidence = this.repo.recordEvidence({
            operation_id: op.operation_id,
            evidence_type: 'verification_lookup',
            provider_reference: refund.provider_refund_id,
            observed_status: refund.status,
            outcome: 'VERIFIED_SUCCESS',
            data: refund,
          });

          if (op.state !== OperationStateEnum.SUCCEEDED) {
            this.repo.transitionOperation(
              op.operation_id,
              OperationStateEnum.SUCCEEDED,
              'Outcome verified successful against provider lookup.'
            );
          }

          return {
            operation_id: op.operation_id,
            outcome: 'VERIFIED_SUCCESS',
            status: refund.status,
            provider_reference: refund.provider_refund_id,
            mismatch_flags: [],
            reason: 'Refund confirmed completed by provider.',
            evidence_id: evidence.evidence_id,
          };
        } else if (refund.status === 'FAILED') {
          const evidence = this.repo.recordEvidence({
            operation_id: op.operation_id,
            evidence_type: 'verification_lookup',
            provider_reference: refund.provider_refund_id,
            observed_status: refund.status,
            outcome: 'VERIFIED_FAILURE',
            data: refund,
          });

          if (op.state !== OperationStateEnum.FAILED) {
            this.repo.transitionOperation(
              op.operation_id,
              OperationStateEnum.FAILED,
              'Outcome verified failed by provider lookup.'
            );
          }

          return {
            operation_id: op.operation_id,
            outcome: 'VERIFIED_FAILURE',
            status: refund.status,
            provider_reference: refund.provider_refund_id,
            mismatch_flags: [],
            reason: 'Refund confirmed failed by provider.',
            evidence_id: evidence.evidence_id,
          };
        }
      } catch (err: any) {
        // Fall through to Path B
      }
    }

    // Path B: Refund ID unknown (Lost response / OUTCOME_UNKNOWN recovery)
    // First, move state to VERIFYING
    if (op.state === OperationStateEnum.OUTCOME_UNKNOWN) {
      this.repo.transitionOperation(
        op.operation_id,
        OperationStateEnum.VERIFYING,
        'Initiating active provider reconciliation.'
      );
    }

    try {
      // 1. Same-key replay with identical provider_idempotency_key (Spike Notes Exp 3)
      const replayResult = await this.adapter.refund({
        operation_id: op.operation_id,
        provider_idempotency_key: op.provider_idempotency_key,
        capture_id: op.payment_id,
        amount: op.amount ?? undefined,
        reason: op.reason,
      });

      if (replayResult.status === 'COMPLETED' && replayResult.custom_id === op.operation_id) {
        const evidence = this.repo.recordEvidence({
          operation_id: op.operation_id,
          evidence_type: 'same_key_replay_reconciliation',
          provider_reference: replayResult.provider_refund_id,
          observed_status: replayResult.status,
          outcome: 'VERIFIED_SUCCESS',
          data: replayResult,
        });

        this.repo.transitionOperation(
          op.operation_id,
          OperationStateEnum.SUCCEEDED,
          'Reconciled via same-key replay: provider returned existing refund without duplicate execution.',
          replayResult.provider_refund_id
        );

        return {
          operation_id: op.operation_id,
          outcome: 'VERIFIED_SUCCESS',
          status: replayResult.status,
          provider_reference: replayResult.provider_refund_id,
          mismatch_flags: [],
          reason: 'Lost response resolved: provider confirmed existing refund via same-key replay.',
          evidence_id: evidence.evidence_id,
        };
      }
    } catch (replayErr: any) {
      // Check capture details
      try {
        const capture = await this.adapter.getCapture(op.payment_id);
        const evidence = this.repo.recordEvidence({
          operation_id: op.operation_id,
          evidence_type: 'capture_details_inspection',
          provider_reference: capture.capture_id,
          observed_status: capture.status,
          outcome: 'UNRESOLVED',
          data: capture,
        });

        // Escalate to human review
        this.transitionToNeedsReview(
          op.operation_id,
          this.repo.getOperation(op.operation_id)!.state,
          'Verification inconclusive after lost response; escalated to human review.'
        );

        return {
          operation_id: op.operation_id,
          outcome: 'UNRESOLVED',
          status: 'UNRESOLVED',
          mismatch_flags: [],
          reason: 'Could not prove provider outcome with certainty. Escalated to NEEDS_REVIEW.',
          evidence_id: evidence.evidence_id,
        };
      } catch (capErr: any) {
        // Provider completely unreachable
      }
    }

    this.transitionToNeedsReview(
      op.operation_id,
      this.repo.getOperation(op.operation_id)!.state,
      'Provider unreachable during verification; escalated to NEEDS_REVIEW.'
    );

    return {
      operation_id: op.operation_id,
      outcome: 'UNRESOLVED',
      status: 'UNRESOLVED',
      mismatch_flags: [],
      reason: 'Provider unreachable. Blind retry forbidden; queued for human review.',
    };
  }

  private transitionToNeedsReview(operationId: string, currentState: any, reason: string): void {
    let state = currentState;
    if (state === OperationStateEnum.EXECUTING) {
      state = this.repo.transitionOperation(operationId, OperationStateEnum.OUTCOME_UNKNOWN, 'Transitioning to verification').state;
    }
    if (state === OperationStateEnum.OUTCOME_UNKNOWN) {
      state = this.repo.transitionOperation(operationId, OperationStateEnum.VERIFYING, 'Transitioning to verification').state;
    }
    if (state === OperationStateEnum.VERIFYING) {
      this.repo.transitionOperation(operationId, OperationStateEnum.NEEDS_REVIEW, reason);
    }
  }
}
