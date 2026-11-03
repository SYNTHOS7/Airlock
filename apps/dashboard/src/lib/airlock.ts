import { createDatabase, AirlockRepository, reconcileStartupOperations } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { createPolicyConfig } from '@airlock/policy-engine';
import { ApprovalService, ExecutionService } from '@airlock/mcp-server';
import { resolve } from 'node:path';

// Singleton container for server-side Airlock instances
declare global {
  // eslint-disable-next-line no-var
  var __airlockInstance: {
    db: any;
    repo: AirlockRepository;
    adapter: MockProviderAdapter;
    approvalService: ApprovalService;
    executionService: ExecutionService;
    config: any;
  } | undefined;
}

export function getAirlock() {
  if (!global.__airlockInstance) {
    const dbPath = process.env.DATABASE_PATH || resolve(process.cwd(), '../../data/airlock.db');
    const db = createDatabase({ path: dbPath });
    const repo = new AirlockRepository(db);
    const adapter = new MockProviderAdapter('success');
    const config = createPolicyConfig({
      approval_threshold_minor: Number(process.env.POLICY_APPROVAL_THRESHOLD_MINOR) || 5000, // $50.00
      cumulative_cap_minor: Number(process.env.POLICY_CUMULATIVE_CAP_MINOR) || 20000, // $200.00
      velocity_max_count: Number(process.env.POLICY_VELOCITY_MAX_REFUNDS) || 5,
      velocity_window_seconds: Number(process.env.POLICY_VELOCITY_WINDOW_SECONDS) || 3600,
    });

    // Run startup crash reconciliation (FR-11)
    reconcileStartupOperations(db, repo);

    const approvalService = new ApprovalService(repo);
    const executionService = new ExecutionService(repo, adapter, config);

    global.__airlockInstance = {
      db,
      repo,
      adapter,
      approvalService,
      executionService,
      config,
    };
  }

  return global.__airlockInstance;
}

