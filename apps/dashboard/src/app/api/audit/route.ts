import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { requireRole, isUser } from '@/lib/api-auth';

export async function GET(req: Request) {
  // Require authenticated identity with appropriate role to view audit log
  const userOrError = requireRole(req, 'viewer', 'approver', 'support_agent');
  if (!isUser(userOrError)) return userOrError;

  const { db } = getAirlock();
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all();
  return NextResponse.json({ audit_log: rows });
}
