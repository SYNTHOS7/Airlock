import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { requireRole, isUser } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    // Shared server-side authentication: require 'viewer' or 'approver' role
    // Fails closed if unauthenticated, forbidden, or if demo auth is disabled in production
    const userOrError = requireRole(req, 'viewer', 'approver');
    if (!isUser(userOrError)) return userOrError;

    const body = await req.json();
    const { operation_id } = body;
    if (!operation_id) {
      return NextResponse.json({ error: 'operation_id is required' }, { status: 400 });
    }

    const { repo, adapter } = getAirlock();
    const verifier = new OutcomeVerifier(repo, adapter);
    const verificationResult = await verifier.verifyOperation(operation_id);

    return NextResponse.json({
      operation_id,
      verification: verificationResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Verification failed' },
      { status: 500 }
    );
  }
}
