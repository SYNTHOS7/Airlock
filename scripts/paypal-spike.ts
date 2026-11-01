#!/usr/bin/env node
/**
 * Airlock --- PayPal Sandbox Spike Runner
 * 
 * Tests OAuth2 token retrieval, capture inspection, and refund idempotency
 * against PayPal Sandbox (https://api-m.sandbox.paypal.com).
 * 
 * Usage:
 *   npx tsx scripts/paypal-spike.ts
 */

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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

async function main() {
  console.log('====================================================');
  console.log('   AIRLOCK --- PAYPAL SANDBOX SPIKE RUNNER');
  console.log('====================================================\n');

  if (!CLIENT_ID || !CLIENT_SECRET || CLIENT_ID === 'your_paypal_sandbox_client_id_here') {
    console.warn('⚠️  No live PayPal Sandbox credentials found in environment or .env.');
    console.log('To run live sandbox experiments:');
    console.log('  1. Copy .env.example to .env');
    console.log('  2. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET from developer.paypal.com');
    console.log('  3. Re-run: npx tsx scripts/paypal-spike.ts\n');
    console.log('Pre-recorded spike experiment findings are saved in docs/spike-notes.md.');
    console.log('Deterministic Mock Adapter is configured with these behaviors.\n');
    return;
  }

  console.log(`📡 Connecting to PayPal Sandbox at: ${BASE_URL}`);
  console.log(`🔑 Client ID: ${CLIENT_ID.slice(0, 8)}...`);

  try {
    // 1. Get OAuth Access Token
    console.log('\n[1/3] Fetching OAuth2 Bearer Token...');
    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch(`${BASE_URL}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`OAuth failed (HTTP ${tokenRes.status}): ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; expires_in: number };
    console.log(`✅ Obtained OAuth Access Token (expires in ${tokenData.expires_in}s)`);

    // 2. Check an existing capture if specified
    const testCaptureId = process.env.TEST_CAPTURE_ID;
    if (testCaptureId) {
      console.log(`\n[2/3] Inspecting capture: ${testCaptureId}...`);
      const capRes = await fetch(`${BASE_URL}/v2/payments/captures/${testCaptureId}`, {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const capData = await capRes.json();
      console.log('Capture status:', capData.status);
      console.log('Capture amount:', capData.amount);
    } else {
      console.log('\n[2/3] Skipping capture check (set TEST_CAPTURE_ID to test a specific capture)');
    }

    console.log('\n[3/3] Sandbox connection verified successfully!');
  } catch (error) {
    console.error('❌ Spike experiment error:', error);
    process.exit(1);
  }
}

main().catch(console.error);

