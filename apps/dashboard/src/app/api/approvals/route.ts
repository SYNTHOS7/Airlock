import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';

export async function GET() {
  const { approvalService } = getAirlock();
  const queue = approvalService.listPendingApprovals();
  return NextResponse.json({ approvals: queue });
}

