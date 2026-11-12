import { readFileSync } from 'node:fs';

const env: Record<string, string> = {};
const lines = readFileSync('D:/Airlock/.env', 'utf8').split('\n');
for (const line of lines) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) {
    env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

const clientId = env.PAYPAL_CLIENT_ID;
const clientSecret = env.PAYPAL_CLIENT_SECRET;
const baseUrl = env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

async function getToken() {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  return data.access_token;
}

async function getCapture(token: string, captureId: string) {
  const res = await fetch(`${baseUrl}/v2/payments/captures/${captureId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  console.log('Capture Status:', res.status);
  const data = await res.json();
  console.log('Capture Details:', JSON.stringify(data, null, 2));
}

async function getRefund(token: string, refundId: string) {
  const res = await fetch(`${baseUrl}/v2/payments/refunds/${refundId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  console.log('Refund Status:', res.status);
  const data = await res.json();
  console.log('Refund Details:', JSON.stringify(data, null, 2));
}

async function main() {
  const token = await getToken();
  console.log('Checking real PayPal Capture 9RC71678BN337174K...');
  await getCapture(token, '9RC71678BN337174K');
  console.log('\nChecking newly executed real PayPal Refund 3A329627GH459492N...');
  await getRefund(token, '3A329627GH459492N');
}

main().catch(console.error);
