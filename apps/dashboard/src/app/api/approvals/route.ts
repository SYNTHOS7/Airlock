import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { requireRole, isUser } from '@/lib/api-auth';

export async function GET(req: Request) {
  // Require authenticated identity with approver or viewer role
  const userOrError = requireRole(req, 'approver', 'viewer');
  if (!isUser(userOrError)) return userOrError;

  const { approvalService } = getAirlock();
  const queue = approvalService.listPendingApprovals();
  return NextResponse.json({ approvals: queue });
}
