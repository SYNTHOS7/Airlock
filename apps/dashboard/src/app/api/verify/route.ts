import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { resolveUser } from '@airlock/mcp-server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const userHeader = req.headers.get('x-airlock-user');
    const authHeader = req.headers.get('authorization');
    const user = resolveUser(userHeader, authHeader);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid user identity.' }, { status: 401 });
    }

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
