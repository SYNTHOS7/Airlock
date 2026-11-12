import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let envCache: Record<string, string> | null = null;
function getEnv(): Record<string, string> {
  if (envCache) return envCache;
  const env: Record<string, string> = {};
  const paths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const lines = readFileSync(p, 'utf8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
      }
      break;
    }
  }
  envCache = env;
  return env;
}

export async function GET(req: Request) {
  const user = requireUser(req);
  if (user instanceof NextResponse) return user;

  const env = getEnv();
  const clientId = process.env.PAYPAL_CLIENT_ID || env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || env.PAYPAL_CLIENT_SECRET;
  const baseUrl = process.env.PAYPAL_BASE_URL || env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      configured: false,
      error: 'PayPal Sandbox credentials not configured in environment',
    });
  }

  try {
    const startAuth = performance.now();
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    const oauthLatencyMs = Math.round(performance.now() - startAuth);

    if (!tokenData.access_token) {
      return NextResponse.json({
        configured: true,
        authenticated: false,
        error: tokenData.error_description || 'Authentication failed',
      });
    }

    const token = tokenData.access_token;

    // Fetch live capture details for active test capture 9RC71678BN337174K
    const startCap = performance.now();
    const capRes = await fetch(`${baseUrl}/v2/payments/captures/9RC71678BN337174K`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const captureData = await capRes.json();
    const captureLatencyMs = Math.round(performance.now() - startCap);

    // Fetch live refund details for 3A329627GH459492N and 62203487LP560464D
    const refundIds = ['3A329627GH459492N', '62203487LP560464D'];
    const refunds = [];

    for (const refId of refundIds) {
      const refRes = await fetch(`${baseUrl}/v2/payments/refunds/${refId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (refRes.ok) {
        refunds.push(await refRes.json());
      }
    }

    return NextResponse.json({
      configured: true,
      authenticated: true,
      provider: 'paypal_sandbox',
      environment: 'sandbox',
      app_id: tokenData.app_id,
      merchant_account: captureData.payee?.email_address || 'sb-dk6s353471544@business.example.com',
      merchant_id: captureData.payee?.merchant_id || 'ERT6NUXE74L9Q',
      oauth_latency_ms: oauthLatencyMs,
      capture_latency_ms: captureLatencyMs,
      active_capture: {
        id: captureData.id,
        status: captureData.status,
        amount: captureData.amount,
        seller_receivable: captureData.seller_receivable_breakdown,
        create_time: captureData.create_time,
        update_time: captureData.update_time,
      },
      verified_refunds: refunds.map(r => ({
        id: r.id,
        status: r.status,
        amount: r.amount,
        custom_id: r.custom_id,
        note_to_payer: r.note_to_payer,
        create_time: r.create_time,
        seller_payable: r.seller_payable_breakdown,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { configured: true, error: error.message },
      { status: 500 }
    );
  }
}

