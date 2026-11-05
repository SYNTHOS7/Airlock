import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { type ProviderAdapter } from '@airlock/contracts';
import { type AirlockRepository } from '@airlock/storage';
import { type PolicyConfig, type JevClient } from '@airlock/policy-engine';
import { ApprovalService } from './approval-service.js';
import { ExecutionService } from './execution-service.js';
import { AirlockMcpTools, type McpContext } from './tools.js';
import { DEMO_USERS, type DemoUser } from './auth.js';

export interface AirlockMcpServerOptions {
  repo: AirlockRepository;
  adapter: ProviderAdapter;
  config: PolicyConfig;
  approvalService?: ApprovalService;
  executionService?: ExecutionService;
  jevClient?: JevClient;
  defaultUser?: DemoUser;
  resolveUser?: (extra?: unknown) => DemoUser;
}

export function createAirlockMcpServer(options: AirlockMcpServerOptions) {
  const approvalService = options.approvalService ?? new ApprovalService(options.repo);
  const executionService =
    options.executionService ??
    new ExecutionService(options.repo, options.adapter, options.config);

  const tools = new AirlockMcpTools(
    options.repo,
    options.adapter,
    options.config,
    approvalService,
    executionService,
    options.jevClient
  );

  const server = new McpServer({
    name: 'airlock-mcp-server',
    version: '0.1.0',
  });

  const getUser = (extra?: unknown): DemoUser => {
    if (options.resolveUser) {
      return options.resolveUser(extra);
    }
    return options.defaultUser ?? DEMO_USERS.agent_1;
  };

  // Tool 1: evaluate_action
  server.tool(
    'evaluate_action',
    'Evaluates a proposed financial action against deterministic safety policies and TypeSafe Jev signals. Pure evaluation with no side effects beyond operation and decision recording.',
    {
      request_id: z.string().min(1).describe("Client's unique idempotent request ID"),
      payment_id: z.string().min(1).describe('Provider capture or payment ID (e.g. CAP-12345)'),
      action_type: z.literal('REFUND').default('REFUND').describe('Action type to evaluate (REFUND)'),
      amount_minor: z.number().int().positive().optional().describe('Amount in minor units (e.g. 2500 for $25.00)'),
      currency: z.string().length(3).default('USD').describe('ISO 4217 three-letter currency code'),
      reason: z.string().min(1).describe('Stated reason for the refund request'),
    },
    async (args, extra) => {
      const user = getUser(extra);
      const result = await tools.evaluateAction(args, { user });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Tool 2: request_approval
  server.tool(
    'request_approval',
    'Requests single-use human approval for an action requiring authorization. Computes a tamper-proof SHA-256 action hash and sets a 15-minute expiration.',
    {
      operation_id: z.string().min(1).describe('Operation ID awaiting approval'),
    },
    async (args, extra) => {
      const user = getUser(extra);
      const result = await tools.requestApproval(args, { user });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Tool 3: execute_approved_action
  server.tool(
    'execute_approved_action',
    'Executes an authorized action against the payment rail. Performs pre-execution recheck with fresh balance facts, consumes approval atomically, writes ahead to storage, and dispatches to provider.',
    {
      operation_id: z.string().min(1).describe('Operation ID to execute'),
    },
    async (args, extra) => {
      const user = getUser(extra);
      const result = await tools.executeApprovedAction(args, { user });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Tool 4: verify_outcome
  server.tool(
    'verify_outcome',
    'Reconciles an operation against the payment rail to resolve ambiguous states (such as network timeouts or lost responses). Never retries blindly.',
    {
      operation_id: z.string().min(1).describe('Operation ID to reconcile and verify'),
    },
    async (args, extra) => {
      const user = getUser(extra);
      const result = await tools.verifyOutcome(args, { user });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return {
    server,
    tools,
    approvalService,
    executionService,
    startStdio: async () => {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}

