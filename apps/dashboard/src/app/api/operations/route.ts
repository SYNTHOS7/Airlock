import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { evaluate, loadPolicyFacts, JevClient, buildJevInput } from '@airlock/policy-engine';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  DispositionEnum,
  mapJevSignalsToDisposition,
  mergeDispositions,
  type ActionRequest,
} from '@airlock/contracts';
import { ExecutionService } from '@airlock/mcp-server';
import { requireUser, isUser } from '@/lib/api-auth';

export async function GET(req: Request) {
  // Require authenticated identity to view operations list
  const userOrError = requireUser(req);
  if (!isUser(userOrError)) return userOrError;

  const { db, adapter } = getAirlock();
  const rows = db.prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT 50').all();
  return NextResponse.json({
    operations: rows,
    provider: adapter.providerName,
  });
}

export async function POST(req: Request) {
  try {
    // Server-side identity — never fabricate from body
    const userOrError = requireUser(req);
    if (!isUser(userOrError)) return userOrError;
    const user = userOrError;

    const body = await req.json();

    // Policy settings are strictly authoritative on the server.
    // Callers cannot inject or weaken policy thresholds in request bodies.
    if (
      body.approval_threshold_minor != null ||
      body.cumulative_cap_minor != null ||
      body.velocity_max_count != null
    ) {
      return NextResponse.json(
        { error: 'Security violation: Request body cannot override authoritative server policy invariants.' },
        { status: 400 }
      );
    }

    const { repo, adapter, config, approvalService } = getAirlock();
    const activeConfig = config;

    const rawMinor = body.amount_minor != null ? Number(body.amount_minor) : (body.amount != null ? Math.round(Number(body.amount) * 100) : undefined);
    const amount = rawMinor != null ? createMoney(rawMinor / 100, body.currency || 'USD') : undefined;

    const actionRequest: ActionRequest = {
      request_id: body.request_id || `req_${Date.now()}`,
      action_type: 'REFUND',
      payment_id: (body.payment_id || '').trim(),
      amount,
      reason: (body.reason || '').trim(),
      requester_id: user.id,
    };

    // 1. Intake with Idempotency
    const fp = computeParamsFingerprint(actionRequest);
    const { operation, isNew } = repo.createOrGetOperation({
      ...actionRequest,
      params_fingerprint: fp,
      provider: adapter.providerName,
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
      config: activeConfig,
      caller_roles: user.roles,
    });

    const policyResult = evaluate(actionRequest, facts, activeConfig);
    const decisionLayer = await new JevClient().evaluateSignals(buildJevInput(actionRequest, facts));
    let finalDisposition = policyResult.disposition;
    const finalReasons = [...policyResult.reasons];
    if (decisionLayer.signals) {
      finalDisposition = mergeDispositions(finalDisposition, mapJevSignalsToDisposition(decisionLayer.signals));
      if (decisionLayer.signals.explanation) finalReasons.push(`Decision layer: ${decisionLayer.signals.explanation}`);
    } else if (decisionLayer.status !== 'ran' && finalDisposition === DispositionEnum.ALLOW) {
      finalDisposition = DispositionEnum.REQUIRE_APPROVAL;
      finalReasons.push(`Decision layer ${decisionLayer.status}: failing safe to human approval.`);
    }

    repo.recordDecision({
      operation_id: operation.operation_id,
      jev_status: decisionLayer.status,
      jev_signals: decisionLayer.signals,
      policy_result: policyResult.disposition,
      policy_rule_ids: policyResult.ruleIds,
      policy_reason: finalReasons.join('; '),
      final_disposition: finalDisposition,
    });

    // 4. Branch based on disposition
    if (finalDisposition === DispositionEnum.DENY) {
      const deniedOp = repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.DENIED,
        finalReasons[0]
      );
      return NextResponse.json({ operation: deniedOp, disposition: finalDisposition, reasons: finalReasons, decisionLayer: { status: decisionLayer.status, version: decisionLayer.version } });
    }

    if (finalDisposition === DispositionEnum.REQUIRE_APPROVAL) {
      const approval = await approvalService.requestApproval({
        operation_id: operation.operation_id,
      });
      const awaitingOp = repo.getOperation(operation.operation_id)!;
      return NextResponse.json({
        operation: awaitingOp,
        disposition: finalDisposition,
        approval,
        reasons: finalReasons,
        decisionLayer: { status: decisionLayer.status, version: decisionLayer.version },
      });
    }

    if (finalDisposition === DispositionEnum.PAUSE_REVIEW) {
      const reviewOp = repo.transitionOperation(
        operation.operation_id,
        OperationStateEnum.NEEDS_REVIEW,
        finalReasons[0]
      );
      return NextResponse.json({ operation: reviewOp, disposition: finalDisposition, reasons: finalReasons, decisionLayer: { status: decisionLayer.status, version: decisionLayer.version } });
    }

    // If ALLOW, send execution through the shared guarded service.
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
    const executionService = new ExecutionService(repo, adapter, activeConfig);
    const execution = await executionService.executeApproved({ operation_id: operation.operation_id, approver_id: user.id });
    const finalOp = repo.getOperation(operation.operation_id);
    return NextResponse.json({ operation: finalOp, disposition: finalDisposition, reasons: finalReasons, execution, decisionLayer: { status: decisionLayer.status, version: decisionLayer.version } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
