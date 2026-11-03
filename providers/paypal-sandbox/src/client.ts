export interface PayPalClientConfig {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * PayPal Sandbox REST HTTP Client with token caching & safety boundaries.
 * 
 * Safety invariants:
 * 1. Strictly refuses live production URLs (https://api-m.paypal.com).
 * 2. Redacted logging: Authorization headers and client secrets are NEVER printed.
 * 3. Token caching: Reuses Bearer token until 60s before expiration.
 * 4. Timeouts & structured error extraction.
 */
export class PayPalHttpClient {
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private timeoutMs: number;
  private tokenCache: CachedToken | null = null;

  constructor(config: PayPalClientConfig = {}) {
    this.clientId = config.clientId || process.env.PAYPAL_CLIENT_ID || '';
    this.clientSecret = config.clientSecret || process.env.PAYPAL_CLIENT_SECRET || '';
    this.baseUrl = config.baseUrl || process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
    this.timeoutMs = config.timeoutMs ?? 10000; // 10s timeout

    // Production Rail Guard: Refuse live PayPal URLs
    if (this.baseUrl.includes('api.paypal.com') || (this.baseUrl.includes('api-m.paypal.com') && !this.baseUrl.includes('sandbox'))) {
      throw new Error(
        'CRITICAL SAFETY VIOLATION: Airlock strictly refuses live production PayPal endpoints. Only sandbox endpoints are permitted.'
      );
    }
  }

  public isConfigured(): boolean {
    return Boolean(
      this.clientId &&
      this.clientSecret &&
      this.clientId !== 'your_paypal_sandbox_client_id_here'
    );
  }

  /**
   * Retrieves or refreshes OAuth2 token with proactive caching.
   */
  public async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('PayPal Sandbox credentials not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).');
    }

    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60000) {
      return this.tokenCache.token;
    }

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en_US',
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PayPal OAuth failed (HTTP ${response.status}): ${this.redactSecrets(errorText)}`);
      }

      const data = (await response.json()) as { access_token: string; expires_in: number };
      this.tokenCache = {
        token: data.access_token,
        expiresAt: now + data.expires_in * 1000,
      };

      return this.tokenCache.token;
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(`PayPal OAuth request error: ${err.message}`);
    }
  }

  /**
   * Safe authenticated request to PayPal REST API.
   */
  public async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      headers?: Record<string, string>;
      body?: unknown;
      requestId?: string;
    } = {}
  ): Promise<{ status: number; data: T }> {
    const token = await this.getAccessToken();
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    };

    if (options.requestId) {
      headers['PayPal-Request-Id'] = options.requestId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const status = response.status;
      const text = await response.text();
      let data: any = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        const message = data?.message || data?.details?.[0]?.description || text;
        const issue = data?.details?.[0]?.issue || data?.name || `HTTP_${status}`;
        throw new PayPalApiError(status, issue, this.redactSecrets(message), data);
      }

      return { status, data: data as T };
    } catch (err: any) {
      clearTimeout(timer);
      if (err instanceof PayPalApiError) {
        throw err;
      }
      throw new Error(`PayPal Sandbox network error: ${this.redactSecrets(err.message)}`);
    }
  }

  /**
   * Redacts credentials from error strings to prevent leaking secrets in logs.
   */
  public redactSecrets(msg: string): string {
    if (!msg) return '';
    let sanitized = msg;
    if (this.clientSecret) {
      sanitized = sanitized.replaceAll(this.clientSecret, '[REDACTED_SECRET]');
    }
    if (this.clientId) {
      sanitized = sanitized.replaceAll(this.clientId, '[REDACTED_CLIENT_ID]');
    }
    return sanitized;
  }
}

export class PayPalApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly issue: string,
    message: string,
    public readonly rawDetails?: unknown
  ) {
    super(`PayPal API Error [${issue}] (HTTP ${statusCode}): ${message}`);
    this.name = 'PayPalApiError';
  }
}
