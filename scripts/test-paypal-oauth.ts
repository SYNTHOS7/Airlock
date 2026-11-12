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

async function testOAuth() {
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
  if (data.access_token) {
    console.log('SUCCESS: PayPal Sandbox OAuth token acquired!');
    console.log('App ID:', data.app_id);
    console.log('Token expires in:', data.expires_in, 'seconds');
    return data.access_token;
  } else {
    console.error('FAILED:', data);
  }
}

testOAuth().catch(console.error);
