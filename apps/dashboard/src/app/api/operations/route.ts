import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { evaluate, loadPolicyFacts } from '@airlock/policy-engine';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  DispositionEnum,
  type ActionRequest,
} from '@airlock/contracts';
import { resolveUser } from '@airlock/mcp-server';

export async function GET() {
  const { db } = getAirlock();
  const rows = db.prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT 50').all();
  return NextResponse.json({ operations: rows });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userHeader = req.headers.get('x-airlock-user');
    const authHeader = req.headers.get('authorization');
    const user = resolveUser(userHeader, authHeader) || {
      id: body.requester_id || 'agent_1',
      name: 'Support Agent',
      roles: ['support_agent' as const],
      token: '',
    };

    const { repo, adapter, config, approvalService, executionService } = getAirlock();

    const amount = body.amount_minor != null ? createMoney(body.amount_minor / 100, body.currency || 'USD') : undefined;

    const actionRequest: ActionRequest = {
      request_id: body.request_id || `req_${Date.now()}`,
      action_type: 'REFUND',
      payment_id: body.payment_id,
      amount,
      reason: body.reason,
      requester_id: user.id,
    };

    // 1. Intake with Idempotency
    const fp = computeParamsFingerprint(actionRequest);
    const { operation, isNew } = repo.createOrGetOperation({
      ...actionRequest,
      params_fingerprint: fp,
      provider: 'mock',
    });

    if (!isNew && operation.state === OperationStateEnum.SUCCEEDED) {
      return NextResponse.json({
        operation,
        replayed: true,
        message: 'Existing completed operation returned (IDEMP-001).',
      });
    }

    // 2. Validate
    repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);

    // 3. Evaluate Policy
    repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);
    const facts = await loadPolicyFacts({
      caller_id: user.id,
      payment_id: actionRequest.payment_id,
      repository: repo,
      adapter,
      config,
      caller_roles: user.roles,
    });

    const evalResult = evaluate(actionRequest, facts, config);

    repo.recordDecision({
      operation_id: operation.operation_id,
      jev_status: 'ran',
      policy_result: evalResult.policyDisposition,
      policy_rule_ids: evalResult.ruleIds,
      policy_reason: evalResult.reasons.join('; '),
      final_disposition: evalResult.disposition,
    });

    // 4. Branch based on disposition
    if (evalResult.disposition === DispositionEnum.DENY) {
      const deniedOp = repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.DENIED,
        evalResult.reasons[0]
      );
      return NextResponse.json({ operation: deniedOp, disposition: evalResult.disposition, reasons: evalResult.reasons });
    }

    if (evalResult.disposition === DispositionEnum.REQUIRE_APPROVAL) {
      const approval = await approvalService.requestApproval({
        operation_id: operation.operation_id,
      });
      const awaitingOp = repo.getOperation(operation.operation_id)!;
      return NextResponse.json({
        operation: awaitingOp,
        disposition: evalResult.disposition,
        approval,
        reasons: evalResult.reasons,
      });
    }

    if (evalResult.disposition === DispositionEnum.PAUSE_REVIEW) {
      const reviewOp = repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.NEEDS_REVIEW,
        evalResult.reasons[0]
      );
      return NextResponse.json({ operation: reviewOp, disposition: evalResult.disposition, reasons: evalResult.reasons });
    }

    // If ALLOW -> proceed to READY and execute
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
    const executingOp = repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

    const refundRes = await adapter.refund({
      operation_id: operation.operation_id,
      provider_idempotency_key: executingOp.provider_idempotency_key,
      capture_id: actionRequest.payment_id,
      amount: actionRequest.amount,
      reason: actionRequest.reason,
    });

    repo.recordEvidence({
      operation_id: operation.operation_id,
      evidence_type: 'provider_response',
      provider_reference: refundRes.provider_refund_id,
      observed_status: refundRes.status,
      outcome: 'VERIFIED_SUCCESS',
      data: refundRes.raw_response,
    });

    const finalOp = repo.transitionOperation(
      operation.operation_id,
      OperationStateEnum.SUCCEEDED,
      'Refund completed and verified',
      refundRes.provider_refund_id
    );

    return NextResponse.json({ operation: finalOp, disposition: evalResult.disposition, reasons: evalResult.reasons });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

