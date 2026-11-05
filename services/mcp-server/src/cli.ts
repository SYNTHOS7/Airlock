#!/usr/bin/env node
import { resolve } from 'node:path';
import { createDatabase, AirlockRepository } from '@airlock/storage';
import { MockProviderAdapter } from '@airlock/provider-mock';
import { DEFAULT_POLICY_CONFIG } from '@airlock/policy-engine';
import { createAirlockMcpServer } from './server.js';
import { startHttpServer } from './http.js';
import { DEMO_USERS } from './auth.js';

async function main() {
  const dbPath = process.env.DATABASE_PATH || resolve(process.cwd(), 'data/airlock.db');
  const db = createDatabase({ path: dbPath });
  const repo = new AirlockRepository(db);
  const adapter = new MockProviderAdapter('success');

  const userId = process.env.AIRLOCK_USER || 'agent_1';
  const defaultUser = DEMO_USERS[userId] || DEMO_USERS.agent_1;

  const { server, tools, approvalService, executionService, startStdio } = createAirlockMcpServer({
    repo,
    adapter,
    config: DEFAULT_POLICY_CONFIG,
    defaultUser,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : null;

  if (port) {
    console.log(`Starting Airlock Backend HTTP server on port ${port}...`);
    startHttpServer(port, {
      repo,
      adapter,
      config: DEFAULT_POLICY_CONFIG,
      tools,
      approvalService,
      executionService,
    });
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  console.error('Fatal MCP Server error:', err);
  process.exit(1);
});

