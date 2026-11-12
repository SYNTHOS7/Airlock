import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { requireUser, isUser } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    // 1. Authenticate identity from server-controlled headers (fail closed)
    const userOrError = requireUser(req);
    if (!isUser(userOrError)) return userOrError;
    const user = userOrError;

    // 2. Validate request body
    const body = await req.json();
    const { operation_id } = body;
    if (!operation_id) {
      return NextResponse.json({ error: 'operation_id is required' }, { status: 400 });
    }

    // 3. Retrieve operation from storage
    const { repo, adapter } = getAirlock();
    const operation = repo.getOperation(operation_id);
    if (!operation) {
      return NextResponse.json({ error: `Operation '${operation_id}' not found` }, { status: 404 });
    }

    // 4. Role-based verification authorization
    // Approvers and viewers have system-wide verification rights.
    // Support agents can verify ONLY operations they originally requested.
    const isPrivileged = user.roles.some((r) => r === 'viewer' || r === 'approver');
    const isSupportAgent = user.roles.includes('support_agent');

    if (!isPrivileged) {
      if (isSupportAgent) {
        if (operation.requester_id !== user.id) {
          return NextResponse.json(
            { error: 'Forbidden: Support agents may only verify their own operations.' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions to verify operation.' },
          { status: 403 }
        );
      }
    }

    // 5. Run outcome verifier
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

