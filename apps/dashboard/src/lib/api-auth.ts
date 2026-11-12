import { resolveUser } from '@airlock/mcp-server';
import type { DemoUser } from '@airlock/mcp-server';
import { NextResponse } from 'next/server';

/**
 * Checks whether demo authentication is permitted in the current environment.
 * Demo personas are only allowed in local/demo mode and with mock payment rails.
 */
function isDemoAuthAllowed(): { allowed: boolean; reason?: string } {
  // Disallow demo auth if explicitly disabled
  if (process.env.ENABLE_DEMO_AUTH === 'false') {
    return { allowed: false, reason: 'Demo authentication is explicitly disabled.' };
  }

  // If in production, require explicit ENABLE_DEMO_AUTH=true
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_AUTH !== 'true') {
    return {
      allowed: false,
      reason: 'Demo authentication is disabled in production. Configure enterprise OIDC/OAuth2 authentication.',
    };
  }

  // Fail-safe: Demo authentication is permitted ONLY for mock or PayPal Sandbox demo modes.
  // It is strictly forbidden for live payments or production deployments.
  const provider = (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
  if (provider !== 'mock' && provider !== 'paypal_sandbox') {
    return {
      allowed: false,
      reason: `Unsafe configuration: Demo authentication cannot be used with payment provider '${provider}'. Only 'mock' and 'paypal_sandbox' demo rails are supported.`,
    };
  }

  return { allowed: true };
}

/**
 * Resolve and validate demo user identity from request headers.
 *
 * IMPORTANT: This is demo authentication for local prototyping and
 * hackathon review only — NOT production-grade authentication.
 * Production deployments MUST integrate OIDC/OAuth2/SAML providers
 * (e.g. Supabase Auth, Clerk, Auth0).
 *
 * Identity is determined exclusively from server-controlled headers;
 * the request body is never trusted for identity or role claims.
 */
export function requireUser(req: Request): DemoUser | NextResponse {
  const demoCheck = isDemoAuthAllowed();
  if (!demoCheck.allowed) {
    return NextResponse.json(
      { error: `Forbidden: ${demoCheck.reason}` },
      { status: 403 }
    );
  }

  const userHeader = req.headers.get('x-airlock-user');
  const authHeader = req.headers.get('authorization');
  const user = resolveUser(userHeader, authHeader);

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized: valid demo identity required via x-airlock-user header or Authorization bearer token.' },
      { status: 401 }
    );
  }

  return user;
}

/**
 * Require a specific role. Returns the DemoUser if authorized,
 * or a 401/403 NextResponse if not.
 */
export function requireRole(req: Request, ...roles: string[]): DemoUser | NextResponse {
  const result = requireUser(req);
  if (result instanceof NextResponse) return result;

  const hasRole = result.roles.some((r) => roles.includes(r));
  if (!hasRole) {
    return NextResponse.json(
      { error: `Forbidden: one of [${roles.join(', ')}] role(s) required.` },
      { status: 403 }
    );
  }

  return result;
}

/** Type guard: true when the result is a resolved DemoUser, not an error response. */
export function isUser(result: DemoUser | NextResponse): result is DemoUser {
  return !(result instanceof NextResponse);
}
