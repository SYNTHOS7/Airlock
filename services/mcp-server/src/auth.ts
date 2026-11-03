import { type CallerRole } from '@airlock/policy-engine';

export interface DemoUser {
  id: string;
  name: string;
  roles: CallerRole[];
  token: string;
}

/**
 * Demo Users for Hackathon Demonstration of Separation of Duties (Day 3 Block 4).
 * IMPORTANT: This is demo authentication for local testing and hackathon review,
 * not production-grade authentication.
 */
export const DEMO_USERS: Record<string, DemoUser> = {
  agent_1: {
    id: 'agent_1',
    name: 'Agent Sarah (Support Agent)',
    roles: ['support_agent'],
    token: 'tok_agent_1',
  },
  approver_1: {
    id: 'approver_1',
    name: 'Manager Dave (Human Approver)',
    roles: ['approver'],
    token: 'tok_approver_1',
  },
  viewer_1: {
    id: 'viewer_1',
    name: 'Auditor Emma (Read-Only Viewer)',
    roles: ['viewer'],
    token: 'tok_viewer_1',
  },
};

/**
 * Resolves a request's user and permissions from headers.
 * Accepts:
 *   - 'x-airlock-user': user id ('agent_1', 'approver_1', 'viewer_1')
 *   - 'authorization': 'Bearer <token>'
 */
export function resolveUser(
  userHeader?: string | null,
  authHeader?: string | null
): DemoUser | null {
  if (userHeader && DEMO_USERS[userHeader]) {
    return DEMO_USERS[userHeader];
  }

  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const matched = Object.values(DEMO_USERS).find((u) => u.token === token || u.id === token);
    if (matched) return matched;
  }

  return null;
}

