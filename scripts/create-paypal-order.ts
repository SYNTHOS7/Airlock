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

async function createOrder(token: string) {
  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `test_ref_${Date.now()}`,
          amount: {
            currency_code: 'USD',
            value: '75.00',
          },
          description: 'Airlock Real Integration Test Order',
        },
      ],
    }),
  });
  const data = await res.json();
  console.log('Create Order Status:', res.status);
  console.log('Order Data:', JSON.stringify(data, null, 2));
  return data;
}

async function main() {
  const token = await getToken();
  await createOrder(token);
}

main().catch(console.error);
