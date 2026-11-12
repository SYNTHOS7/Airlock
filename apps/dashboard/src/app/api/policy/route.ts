import { NextResponse } from 'next/server';
import { getAirlock } from '@/lib/airlock';
import { requireRole, isUser } from '@/lib/api-auth';
import { createPolicyConfig } from '@airlock/policy-engine';
import { ExecutionService } from '@airlock/mcp-server';

export async function GET(req: Request) {
  const { config } = getAirlock();
  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  try {
    // Only authorized approvers can modify live safety invariants
    const userOrError = requireRole(req, 'approver');
    if (!isUser(userOrError)) return userOrError;

    const body = await req.json();
    const airlock = getAirlock();

    // Validate bounds for thresholds
    const approval_threshold_minor = body.approval_threshold_minor != null
      ? Number(body.approval_threshold_minor)
      : airlock.config.approval_threshold_minor;

    const cumulative_cap_minor = body.cumulative_cap_minor != null
      ? Number(body.cumulative_cap_minor)
      : airlock.config.cumulative_cap_minor;

    const velocity_max_count = body.velocity_max_count != null
      ? Number(body.velocity_max_count)
      : airlock.config.velocity_max_count;

    if (isNaN(approval_threshold_minor) || approval_threshold_minor < 1000 || approval_threshold_minor > 200000) {
      return NextResponse.json(
        { error: 'Validation error: approval_threshold_minor must be between 1000 ($10) and 200000 ($2000).' },
        { status: 400 }
      );
    }

    if (isNaN(cumulative_cap_minor) || cumulative_cap_minor < 5000 || cumulative_cap_minor > 500000) {
      return NextResponse.json(
        { error: 'Validation error: cumulative_cap_minor must be between 5000 ($50) and 500000 ($5000).' },
        { status: 400 }
      );
    }

    if (isNaN(velocity_max_count) || velocity_max_count < 1 || velocity_max_count > 50) {
      return NextResponse.json(
        { error: 'Validation error: velocity_max_count must be between 1 and 50.' },
        { status: 400 }
      );
    }

    // Apply validated configuration authoritatively to the server instance
    airlock.config = createPolicyConfig({
      ...airlock.config,
      approval_threshold_minor,
      cumulative_cap_minor,
      velocity_max_count,
    });

    // Re-instantiate executionService with the new authoritative config
    airlock.executionService = new ExecutionService(airlock.repo, airlock.adapter, airlock.config);

    return NextResponse.json({
      success: true,
      config: airlock.config,
      updated_by: userOrError.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update policy' }, { status: 400 });
  }
}

