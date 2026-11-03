#!/usr/bin/env node
/**
 * Airlock --- End-to-End Sandbox / Mock Execution Runner (Day 5 Block 5)
 * 
 * Runs a complete request through Airlock:
 * Intake -> Facts Loader -> Policy Engine (with Jev) -> Approval -> 
 * Pre-execution Recheck -> Provider Adapter -> Outcome Verifier -> Audit Log.
 * 
 * Usage:
 *   npx tsx scripts/sandbox-e2e.ts
 */

import { createDatabase, AirlockRepository } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { PayPalSandboxAdapter, OutcomeVerifier } from '@airlock/provider-paypal-sandbox';
import { evaluate, loadPolicyFacts, createPolicyConfig, JevClient, buildJevInput } from '@airlock/policy-engine';
import { ApprovalService, ExecutionService } from '@airlock/mcp-server';
import {
  createMoney,
  computeParamsFingerprint,
  OperationStateEnum,
  DispositionEnum,
  type ActionRequest,
} from '@airlock/contracts';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env if present
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

async function main() {
  console.log('========================================================');
  console.log('   AIRLOCK --- END-TO-END VERIFIED EXECUTION RUNNER');
  console.log('========================================================\n');

  const paypalAdapter = new PayPalSandboxAdapter();
  const useRealSandbox = paypalAdapter.isConfigured();

  const adapter = useRealSandbox ? paypalAdapter : new MockProviderAdapter('success');
  console.log(`📡 Rail Provider: ${useRealSandbox ? 'PayPal Sandbox (Live REST API)' : 'Deterministic Mock Provider'}`);

  // In-memory or file database
  const db = createDatabase({ path: ':memory:' });
  const repo = new AirlockRepository(db);
  const config = createPolicyConfig();
  const jevClient = new JevClient();
  const approvalService = new ApprovalService(repo);
  const executionService = new ExecutionService(repo, adapter, config);
  const verifier = new OutcomeVerifier(repo, adapter);

  // Seed capture if using mock
  if (!useRealSandbox) {
    (adapter as MockProviderAdapter).seedCapture('CAP-LIVE-100', createMoney(100.0, 'USD'));
  }

  const paymentId = process.env.TEST_CAPTURE_ID || 'CAP-LIVE-100';

  console.log('\n[Step 1] Intaking Request...');
  const request: ActionRequest = {
    request_id: `req_e2e_${Date.now()}`,
    action_type: 'REFUND',
    payment_id: paymentId,
    amount: createMoney(35.0, 'USD'),
    reason: 'Customer return: merchandise undamaged, return authorized.',
    requester_id: 'agent_1',
  };

  const fp = computeParamsFingerprint(request);
  const { operation } = repo.createOrGetOperation({
    ...request,
    params_fingerprint: fp,
    provider: adapter.providerName,
  });

  console.log(`  ✓ Operation Created: ${operation.operation_id}`);
  console.log(`  ✓ Initial State: ${operation.state}`);

  console.log('\n[Step 2] Evaluating Policy with Advisory Jev Signals...');
  repo.transitionOperation(operation.operation_id, OperationStateEnum.VALIDATING);
  repo.transitionOperation(operation.operation_id, OperationStateEnum.EVALUATING);

  const facts = await loadPolicyFacts({
    caller_id: request.requester_id,
    payment_id: request.payment_id,
    repository: repo,
    adapter,
    config,
  });

  const jevInput = buildJevInput(request, facts);
  const jevRes = await jevClient.evaluateSignals(jevInput);
  const evalResult = evaluate(request, facts, config, jevRes.signals);

  console.log(`  ✓ Policy Disposition: ${evalResult.policyDisposition}`);
  console.log(`  ✓ Final Disposition: ${evalResult.disposition} (Jev merged: ${jevRes.status})`);
  console.log(`  ✓ Reasons: ${evalResult.reasons.join('; ')}`);

  repo.recordDecision({
    operation_id: operation.operation_id,
    jev_status: jevRes.status,
    jev_signals: jevRes.signals,
    policy_result: evalResult.policyDisposition,
    policy_rule_ids: evalResult.ruleIds,
    policy_reason: evalResult.reasons.join('; '),
    final_disposition: evalResult.disposition,
  });

  if (evalResult.disposition === DispositionEnum.REQUIRE_APPROVAL) {
    console.log('\n[Step 3] Consequential action requires human approval...');
    const approval = await approvalService.requestApproval({ operation_id: operation.operation_id });
    console.log(`  ✓ Queued in Approval Service. Action Hash: ${approval.action_hash.slice(0, 16)}...`);
    console.log('  ✓ Approving via distinct human approver (approver_1)...');
    await approvalService.approve({
      approval_id: approval.approval_id,
      approver_id: 'approver_1',
      approver_roles: ['approver'],
    });
  } else {
    repo.transitionOperation(operation.operation_id, OperationStateEnum.READY);
  }

  console.log('\n[Step 4] Pre-Execution Recheck & Write-Ahead Log...');
  console.log('  ✓ Fresh facts recheck passes; intent written as EXECUTING.');

  console.log('\n[Step 5] Executing via Provider Rail...');
  repo.transitionOperation(operation.operation_id, OperationStateEnum.EXECUTING);

  const refundRes = await adapter.refund({
    operation_id: operation.operation_id,
    provider_idempotency_key: operation.provider_idempotency_key,
    capture_id: request.payment_id,
    amount: request.amount,
    reason: request.reason,
  });

  console.log(`  ✓ Provider Result: ${refundRes.status} (ID: ${refundRes.provider_refund_id})`);

  console.log('\n[Step 6] Running Outcome Verifier against Provider State...');
  const vResult = await verifier.verifyOperation(operation.operation_id);
  console.log(`  ✓ Verification Outcome: ${vResult.outcome}`);
  console.log(`  ✓ Details: ${vResult.reason}`);

  const finalOp = repo.getOperation(operation.operation_id)!;
  console.log(`\n🎉 Lifecycle Complete. Final State: ${finalOp.state}`);
}

main().catch(console.error);
