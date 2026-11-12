async function testRealRefundExecution() {
  const baseUrl = 'http://localhost:3000';
  console.log('Dispatching REAL refund to PayPal Sandbox on Capture 9RC71678BN337174K...');

  const res = await fetch(`${baseUrl}/api/operations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-airlock-user': 'agent_1',
    },
    body: JSON.stringify({
      request_id: `req_live_${Date.now()}`,
      action_type: 'REFUND',
      payment_id: '9RC71678BN337174K',
      amount_minor: 500, // $5.00
      currency: 'USD',
      reason: 'Customer return for accessories with verified return tracking RMA-8891.',
      requester_id: 'agent_1',
    }),
  });

  console.log('Execution HTTP Status:', res.status);
  const data = await res.json();
  console.log('Execution Response:', JSON.stringify(data, null, 2));
}

testRealRefundExecution().catch(console.error);
