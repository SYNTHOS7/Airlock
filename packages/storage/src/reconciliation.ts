import type Database from 'better-sqlite3';
import { AirlockRepository } from './repository.js';
import { OperationStateEnum } from '@airlock/contracts';

/**
 * Startup Reconciliation (FR-11):
 * On system startup, any operation left in 'EXECUTING' indicates a process crash,
 * power loss, or network termination mid-call.
 * 
 * In accordance with Core Safety Principle 4, Airlock NEVER blindly assumes
 * success or failure. It moves every 'EXECUTING' record to 'OUTCOME_UNKNOWN',
 * requiring explicit provider verification before any next step.
 */
export function reconcileStartupOperations(
  db: Database.Database,
  repository: AirlockRepository
): { reconciledCount: number; operationIds: string[] } {
  const rows = db.prepare(`
    SELECT operation_id, state 
    FROM operations 
    WHERE state = ?
  `).all(OperationStateEnum.EXECUTING) as Array<{ operation_id: string; state: string }>;

  const operationIds: string[] = [];

  for (const row of rows) {
    repository.transitionOperation(
      row.operation_id,
      OperationStateEnum.OUTCOME_UNKNOWN,
      'Startup crash recovery: process restarted while operation was EXECUTING'
    );
    repository.appendAuditLog({
      operation_id: row.operation_id,
      event_type: 'CRASH_RECONCILIATION',
      details: {
        reason: 'Operation was left in EXECUTING state across system restart; moved to OUTCOME_UNKNOWN',
      },
    });
    operationIds.push(row.operation_id);
  }

  return {
    reconciledCount: operationIds.length,
    operationIds,
  };
}

