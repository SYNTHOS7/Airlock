import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';

export async function GET() {
  const { db } = getAirlock();
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all();
  return NextResponse.json({ audit_log: rows });
}

