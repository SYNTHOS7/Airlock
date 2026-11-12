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

async function listTransactions(token: string) {
  // Query transaction search API in PayPal sandbox for past 30 days
  const now = new Date();
  const past = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000);
  const start = past.toISOString().split('.')[0] + 'Z';
  const end = now.toISOString().split('.')[0] + 'Z';

  console.log(`Checking transactions between ${start} and ${end}...`);
  const res = await fetch(`${baseUrl}/v1/reporting/transactions?start_date=${start}&end_date=${end}&page_size=10`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  console.log('Reporting API status:', res.status);
  const data = await res.json();
  if (data.transaction_details) {
    console.log(`Found ${data.transaction_details.length} transactions:`);
    for (const t of data.transaction_details) {
      console.log('Transaction:', t.transaction_info?.transaction_id, t.transaction_info?.transaction_amount, t.transaction_info?.transaction_status);
    }
  } else {
    console.log('Response:', JSON.stringify(data).slice(0, 300));
  }
}

async function main() {
  const token = await getToken();
  await listTransactions(token);
}

main().catch(console.error);

