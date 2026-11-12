import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { evaluate, loadPolicyFacts, JevClient, buildJevInput } from '@airlock/policy-engine';
import { createMoney, type ActionRequest } from '@airlock/contracts';
import { DispositionEnum, mapJevSignalsToDisposition, mergeDispositions } from '@airlock/contracts';
import { requireUser, isUser } from '@/lib/api-auth';

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

    const { repo, adapter, config } = getAirlock();
    const activeConfig = config;

    const amount = body.amount_minor != null ? createMoney(body.amount_minor / 100, body.currency || 'USD') : undefined;

    const actionRequest: ActionRequest = {
      request_id: body.request_id || `req_${Date.now()}`,
      action_type: 'REFUND',
      payment_id: (body.payment_id || 'CAP-DEFAULT-100').trim(),
      amount,
      reason: (body.reason || 'Customer refund request').trim(),
      requester_id: user.id,
    };

    const facts = await loadPolicyFacts({
      caller_id: user.id,
      payment_id: actionRequest.payment_id,
      repository: repo,
      adapter,
      config: activeConfig,
      caller_roles: user.roles,
    });

    const policyResult = evaluate(actionRequest, facts, activeConfig);
    const jevResult = await new JevClient().evaluateSignals(buildJevInput(actionRequest, facts));
    let finalDisposition = policyResult.disposition;
    const reasons = [...policyResult.reasons];
    if (jevResult.signals) {
      finalDisposition = mergeDispositions(finalDisposition, mapJevSignalsToDisposition(jevResult.signals));
      if (jevResult.signals.explanation) reasons.push(`Decision layer: ${jevResult.signals.explanation}`);
    } else if (jevResult.status !== 'ran' && finalDisposition === DispositionEnum.ALLOW) {
      finalDisposition = DispositionEnum.REQUIRE_APPROVAL;
      reasons.push(`Decision layer ${jevResult.status}: failing safe to human approval.`);
    }

    return NextResponse.json({
      disposition: finalDisposition,
      provider: adapter.providerName,
      policyDisposition: policyResult.disposition,
      ruleIds: policyResult.ruleIds,
      reasons,
      decisionLayer: { status: jevResult.status, version: jevResult.version, latencyMs: jevResult.latencyMs },
      facts: {
        payment_capture_status: facts.payment_capture_status,
        remaining_refundable_amount: facts.remaining_refundable_amount,
        completed_refunds_total: facts.completed_refunds_total,
        caller_recent_refunds_count: facts.caller_recent_refunds_count,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
