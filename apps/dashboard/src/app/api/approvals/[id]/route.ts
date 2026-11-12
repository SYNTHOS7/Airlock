import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { requireRole, isUser } from '@/lib/api-auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Server-side identity check — never trust body for approver identity/role
    const userOrError = requireRole(req, 'approver');
    if (!isUser(userOrError)) return userOrError;
    const user = userOrError;

    const { id } = await params;
    const body = await req.json();

    const { approvalService, executionService, repo } = getAirlock();

    if (body.action === 'reject') {
      const rejected = await approvalService.reject({
        approval_id: id,
        approver_id: user.id,
        approver_roles: user.roles,
        reason: body.reason,
      });
      return NextResponse.json({ success: true, approval: rejected, action: 'rejected' });
    }

    // Action is approve
    // 1. Process approval (enforces APPROVAL-002, self-approval check, expiry, hash match)
    const approved = await approvalService.approve({
      approval_id: id,
      approver_id: user.id,
      approver_roles: user.roles,
    });

    // 2. Trigger execution with live Pre-Execution Recheck
    const execResult = await executionService.executeApproved({
      operation_id: approved.operation_id,
      approver_id: user.id,
    });

    return NextResponse.json({
      success: true,
      approval: approved,
      execution: execResult,
      action: 'approved_and_executed',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
