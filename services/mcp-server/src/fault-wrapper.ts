import {
  type ProviderAdapter,
  type ProviderType,
  type RefundCommand,
  type RefundResult,
  type CaptureInfo,
} from '@airlock/contracts';
import { type AirlockRepository } from '@airlock/storage';

export type FaultMode = 'none' | 'drop_response' | 'fail_before_send' | 'delay';

export interface FaultConfig {
  mode?: FaultMode;
  delayMs?: number;
  isProduction?: boolean;
  oneShot?: boolean;
}

export class FaultInjectionError extends Error {
  constructor(
    public readonly mode: FaultMode,
    message: string
  ) {
    super(message);
    this.name = 'FaultInjectionError';
  }
}

/**
 * Fault-Injection Wrapper for Provider Adapters (Spec Part II Section 11, Day 6 Block 1).
 * 
 * Safety invariants:
 * 1. Off by default (mode = 'none').
 * 2. Strictly refuses execution if isProduction is true or environment is production.
 * 3. Every injected fault logs an evidence row of type 'simulated_fault' and audit entry with simulated badge.
 * 4. Transparent pass-through for getRefund and getCapture reconciliation queries.
 */
export class FaultInjectedAdapter implements ProviderAdapter {
  private mode: FaultMode;
  private delayMs: number;
  private isProduction: boolean;
  private oneShot: boolean;

  constructor(
    private inner: ProviderAdapter,
    private repo?: AirlockRepository,
    config?: FaultConfig
  ) {
    this.mode = config?.mode ?? (process.env.FAULT_MODE as FaultMode) ?? 'none';
    this.delayMs = config?.delayMs ?? (process.env.FAULT_DELAY_MS ? Number(process.env.FAULT_DELAY_MS) : 500);
    this.isProduction =
      config?.isProduction ??
      (process.env.NODE_ENV === 'production' || process.env.AIRLOCK_ENV === 'production');
    this.oneShot = config?.oneShot ?? false;

    // Safety guard: refuse fault injection in production
    if (this.isProduction && this.mode !== 'none') {
      throw new Error(
        'CRITICAL SAFETY VIOLATION: Fault injection is strictly forbidden in production or non-sandbox environments.'
      );
    }
  }

  public get providerName(): ProviderType {
    return this.inner.providerName;
  }

  public setMode(mode: FaultMode): void {
    if (this.isProduction && mode !== 'none') {
      throw new Error('CRITICAL SAFETY VIOLATION: Cannot enable fault injection in production.');
    }
    this.mode = mode;
  }

  public getMode(): FaultMode {
    return this.mode;
  }

  public async refund(cmd: RefundCommand): Promise<RefundResult> {
    // Safety check at invocation time
    if (this.isProduction && this.mode !== 'none') {
      throw new Error('CRITICAL SAFETY VIOLATION: Fault injection active in production.');
    }

    switch (this.mode) {
      case 'none':
        return await this.inner.refund(cmd);

      case 'fail_before_send': {
        if (this.repo) {
          this.repo.recordEvidence({
            operation_id: cmd.operation_id,
            evidence_type: 'simulated_fault',
            observed_status: 'SIMULATED_FAIL_BEFORE_SEND',
            outcome: 'UNRESOLVED',
            data: {
              simulated: true,
              mode: 'fail_before_send',
              message: 'Simulated fault: network disconnected before dispatch to provider',
            },
          });

          this.repo.appendAuditLog({
            operation_id: cmd.operation_id,
            event_type: 'SIMULATED_FAULT',
            details: {
              simulated: true,
              mode: 'fail_before_send',
              message: 'Fault injection triggered before provider dispatch',
            },
          });
        }

        if (this.oneShot) {
          this.mode = 'none';
        }

        throw new FaultInjectionError(
          'fail_before_send',
          'Simulated fault: network connection dropped before dispatching to provider rail (fail_before_send)'
        );
      }

      case 'delay': {
        if (this.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.delayMs));
        }

        if (this.repo) {
          this.repo.recordEvidence({
            operation_id: cmd.operation_id,
            evidence_type: 'simulated_fault',
            observed_status: 'SIMULATED_DELAY',
            outcome: 'UNRESOLVED',
            data: {
              simulated: true,
              mode: 'delay',
              delay_ms: this.delayMs,
            },
          });

          this.repo.appendAuditLog({
            operation_id: cmd.operation_id,
            event_type: 'SIMULATED_FAULT',
            details: {
              simulated: true,
              mode: 'delay',
              delay_ms: this.delayMs,
            },
          });
        }

        return await this.inner.refund(cmd);
      }

      case 'drop_response': {
        // Send the real request and let it complete on the payment rail
        const result = await this.inner.refund(cmd);

        // Record simulated fault evidence so audit trail shows exactly what occurred
        if (this.repo) {
          this.repo.recordEvidence({
            operation_id: cmd.operation_id,
            evidence_type: 'simulated_fault',
            provider_reference: result.provider_refund_id,
            observed_status: 'SIMULATED_DROP_RESPONSE',
            outcome: 'UNRESOLVED',
            data: {
              simulated: true,
              mode: 'drop_response',
              provider_refund_id: result.provider_refund_id,
              message:
                'Provider executed refund successfully, but response was dropped to simulate network timeout',
            },
          });

          this.repo.appendAuditLog({
            operation_id: cmd.operation_id,
            event_type: 'SIMULATED_FAULT',
            details: {
              simulated: true,
              mode: 'drop_response',
              provider_refund_id: result.provider_refund_id,
              message:
                'Provider executed successfully, but response dropped to simulate timeout',
            },
          });
        }

        if (this.oneShot) {
          this.mode = 'none';
        }

        // Throw timeout to client
        throw new FaultInjectionError(
          'drop_response',
          'Simulated fault: response dropped after provider execution to simulate network timeout (drop_response)'
        );
      }

      default:
        return await this.inner.refund(cmd);
    }
  }

  public async getRefund(refundId: string): Promise<RefundResult> {
    if (this.mode === 'delay' && this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return await this.inner.getRefund(refundId);
  }

  public async getCapture(captureId: string): Promise<CaptureInfo> {
    if (this.mode === 'delay' && this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return await this.inner.getCapture(captureId);
  }
}
