import { createDatabase, AirlockRepository, reconcileStartupOperations } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { PayPalSandboxAdapter } from '@airlock/provider-paypal-sandbox';
import { createPolicyConfig } from '@airlock/policy-engine';
import { ApprovalService, ExecutionService } from '@airlock/mcp-server';
import type { ProviderAdapter } from '@airlock/contracts';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Singleton container for server-side Airlock instances
declare global {
  // eslint-disable-next-line no-var
  var __airlockInstance: {
    db: any;
    repo: AirlockRepository;
    adapter: ProviderAdapter;
    approvalService: ApprovalService;
    executionService: ExecutionService;
    config: any;
  } | undefined;
}

export function getAirlock() {
  if (!global.__airlockInstance) {
    const dbPath = process.env.DATABASE_PATH || (
      existsSync(resolve(process.cwd(), 'data'))
        ? resolve(process.cwd(), 'data/airlock.db')
        : resolve(process.cwd(), '../../data/airlock.db')
    );
    const db = createDatabase({ path: dbPath });
    const repo = new AirlockRepository(db);

    const rawProvider = (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
    const providerEnv = (rawProvider === 'paypal_sandbox' || rawProvider.includes('paypal') || rawProvider.includes('sandbox'))
      ? 'paypal_sandbox'
      : rawProvider;
    let adapter: ProviderAdapter;

    if (providerEnv === 'paypal_sandbox') {
      const sandboxAdapter = new PayPalSandboxAdapter();
      if (!sandboxAdapter.isConfigured()) {
        throw new Error(
          'CONFIGURATION ERROR: PAYMENT_PROVIDER is set to "paypal_sandbox", but PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing or invalid. Set valid PayPal Sandbox credentials in .env or set PAYMENT_PROVIDER=mock.'
        );
      }
      adapter = sandboxAdapter;
    } else if (providerEnv === 'mock') {
      adapter = new MockProviderAdapter('success');
    } else {
      throw new Error(
        `CONFIGURATION ERROR: Unknown PAYMENT_PROVIDER "${providerEnv}". Allowed values are "mock" (default safe rail) or "paypal_sandbox".`
      );
    }

    const config = createPolicyConfig({
      approval_threshold_minor: Number(process.env.POLICY_APPROVAL_THRESHOLD_MINOR) || 5000, // $50.00
      cumulative_cap_minor: Number(process.env.POLICY_CUMULATIVE_CAP_MINOR) || 20000, // $200.00
      velocity_max_count: Number(process.env.POLICY_VELOCITY_MAX_REFUNDS) || 10,
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
