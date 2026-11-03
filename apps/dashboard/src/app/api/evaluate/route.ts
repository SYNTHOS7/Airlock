import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { evaluate, loadPolicyFacts } from '@airlock/policy-engine';
import { createMoney, type ActionRequest } from '@airlock/contracts';
import { resolveUser } from '@airlock/mcp-server';

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

    const { repo, adapter, config } = getAirlock();

    const amount = body.amount_minor != null ? createMoney(body.amount_minor / 100, body.currency || 'USD') : undefined;

    const actionRequest: ActionRequest = {
      request_id: body.request_id || `req_${Date.now()}`,
      action_type: 'REFUND',
      payment_id: body.payment_id || 'CAP-DEFAULT-100',
      amount,
      reason: body.reason || 'Customer refund request',
      requester_id: user.id,
    };

    const facts = await loadPolicyFacts({
      caller_id: user.id,
      payment_id: actionRequest.payment_id,
      repository: repo,
      adapter,
      config,
      caller_roles: user.roles,
    });

    const result = evaluate(actionRequest, facts, config);

    return NextResponse.json({
      disposition: result.disposition,
      policyDisposition: result.policyDisposition,
      ruleIds: result.ruleIds,
      reasons: result.reasons,
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

