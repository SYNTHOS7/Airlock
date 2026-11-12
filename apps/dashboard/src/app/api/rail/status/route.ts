import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { getAirlock } from '@/lib/airlock';

// Read-only connection check. Refund evidence belongs to the verification endpoint.
export async function GET(req: Request) {
  const user = requireUser(req);
  if (user instanceof NextResponse) return user;
  const { adapter } = getAirlock();
  if (adapter.providerName !== 'paypal_sandbox') {
    return NextResponse.json({ configured: false, authenticated: false, provider: adapter.providerName });
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseUrl = (process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com').replace(/\/$/, '');
  if (baseUrl !== 'https://api-m.sandbox.paypal.com') {
    return NextResponse.json({ error: 'Connection checks require the official PayPal Sandbox endpoint.' }, { status: 400 });
  }
  if (!clientId || !clientSecret) {
    return NextResponse.json({ configured: false, authenticated: false, error: 'Sandbox credentials are not configured.' });
  }
  try {
    const start = performance.now();
    const response = await fetch(baseUrl + '/v1/oauth2/token', {
      method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return NextResponse.json({ configured: true, authenticated: false, error: 'PayPal Sandbox authentication failed (HTTP ' + response.status + ').' }, { status: 502 });
    }
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token) {
      return NextResponse.json({ configured: true, authenticated: false, error: 'PayPal returned no access token.' }, { status: 502 });
    }
    return NextResponse.json({ configured: true, authenticated: true, provider: 'paypal_sandbox', environment: 'sandbox', oauth_latency_ms: Math.round(performance.now() - start) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ configured: true, authenticated: false, error: 'Sandbox connection could not be checked. Check connectivity and credentials.' }, { status: 502 });
  }
}

