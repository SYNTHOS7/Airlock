import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { type AirlockRepository } from '@airlock/storage';
import { type ProviderAdapter } from '@airlock/contracts';
import { type PolicyConfig } from '@airlock/policy-engine';
import { type AirlockMcpTools } from './tools.js';
import { type ApprovalService } from './approval-service.js';
import { type ExecutionService } from './execution-service.js';
import { resolveUser, DEMO_USERS, type DemoUser } from './auth.js';

export interface HttpServerContext {
  repo: AirlockRepository;
  adapter: ProviderAdapter;
  config: PolicyConfig;
  tools: AirlockMcpTools;
  approvalService: ApprovalService;
  executionService: ExecutionService;
}

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-airlock-user',
  });
  res.end(JSON.stringify(data));
}

export function startHttpServer(port: number, ctx: HttpServerContext) {
  const server = createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-airlock-user',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Resolve user from headers
    const userHeader = req.headers['x-airlock-user'] as string | undefined;
    const authHeader = req.headers['authorization'] as string | undefined;
    const user: DemoUser = resolveUser(userHeader, authHeader) || DEMO_USERS.agent_1;

    try {
      // 1. Health check & Root
      if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
        sendJson(res, 200, {
          status: 'ok',
          service: 'airlock-backend',
          version: '0.1.0',
          provider: ctx.adapter.providerName,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. GET /api/operations
      if (req.method === 'GET' && pathname === '/api/operations') {
        const rows = (ctx.repo as any).db.prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT 50').all();
        sendJson(res, 200, { operations: rows });
        return;
      }

      // 3. GET /api/approvals
      if (req.method === 'GET' && pathname === '/api/approvals') {
        const rows = (ctx.repo as any).db.prepare('SELECT * FROM approvals WHERE status = "PENDING" ORDER BY created_at DESC').all();
        sendJson(res, 200, { approvals: rows });
        return;
      }

      // 4. GET /api/audit
      if (req.method === 'GET' && pathname === '/api/audit') {
        const rows = (ctx.repo as any).db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all();
        sendJson(res, 200, { audit_log: rows });
        return;
      }

      // 5. POST /api/evaluate
      if (req.method === 'POST' && pathname === '/api/evaluate') {
        const body = await parseJsonBody(req);
        const result = await ctx.tools.evaluateAction(body, { user });
        sendJson(res, 200, result);
        return;
      }

      // 6. POST /api/approvals
      if (req.method === 'POST' && (pathname === '/api/approvals' || pathname.startsWith('/api/approvals/'))) {
        const body = await parseJsonBody(req);
        const approvalId = pathname.startsWith('/api/approvals/') ? pathname.split('/')[3] : body.approval_id;
        const result = await ctx.approvalService.approve({
          approval_id: approvalId,
          approver_id: user.id,
          approver_roles: user.roles,
        });
        sendJson(res, 200, result);
        return;
      }

      // 7. POST /api/execute
      if (req.method === 'POST' && pathname === '/api/execute') {
        const body = await parseJsonBody(req);
        const result = await ctx.tools.executeApprovedAction(body, { user });
        sendJson(res, 200, result);
        return;
      }

      // 8. POST /api/verify
      if (req.method === 'POST' && pathname === '/api/verify') {
        const body = await parseJsonBody(req);
        const result = await ctx.tools.verifyOutcome(body, { user });
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: 'Not Found' });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Airlock Backend] HTTP server listening on 0.0.0.0:${port}`);
  });

  return server;
}

