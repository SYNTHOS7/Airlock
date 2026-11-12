import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/rail/status/route';
const mocks = vi.hoisted(() => ({ provider: 'paypal_sandbox' }));
vi.mock('@/lib/airlock', () => ({ getAirlock: () => ({ adapter: { providerName: mocks.provider } }) }));
vi.mock('@/lib/api-auth', () => ({ requireUser: () => ({ id: 'viewer_1' }) }));
describe('read-only provider connection monitor', () => {
  beforeEach(() => {
    mocks.provider = 'paypal_sandbox';
    vi.stubEnv('PAYPAL_CLIENT_ID', 'test-client');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 'test-secret');
    vi.stubEnv('PAYPAL_BASE_URL', 'https://api-m.sandbox.paypal.com');
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const request = () => GET(new Request('http://localhost/api/rail/status'));
  it('does not contact a provider in mock mode', async () => {
    mocks.provider = 'mock';
    expect((await request()).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects non-sandbox hosts before transmitting credentials', async () => {
    vi.stubEnv('PAYPAL_BASE_URL', 'https://example.org');
    expect((await request()).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('reports a successful OAuth check without exposing credentials or claiming verified refunds', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ access_token: 'private-token' }));
    const response = await request();
    const data = await response.json();
    expect(data.authenticated).toBe(true);
    expect(data.oauth_latency_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(data)).not.toMatch(/private-token|test-secret|verified_refunds/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });
  it('does not authenticate an error response even if it contains a token', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ access_token: 'invalid' }, { status: 401 }));
    expect((await request()).status).toBe(502);
  });
  it('rejects a response without an access token', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({}));
    expect((await request()).status).toBe(502);
  });
  it('does not leak exception contents to the dashboard', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('test-secret'));
    const response = await request();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('test-secret');
  });
});

