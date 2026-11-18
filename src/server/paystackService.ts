// src/server/paystackService.ts
// Multi-tenant Paystack API client & HMAC-SHA512 webhook verifier.
// Supports per-tenant Secret/Public keys decrypted from tenant_gateway_secrets.

import { createHmac, timingSafeEqual } from 'crypto';

export type PaystackMode = 'live' | 'test' | 'unconfigured';

export interface PaystackInitializeResult {
  ok: boolean;
  configured: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference: string;
  mode: PaystackMode;
  message: string;
  error?: string;
}

export interface PaystackVerifyResult {
  ok: boolean;
  verified: boolean;
  status: 'paid' | 'pending' | 'failed';
  reference: string;
  amountMinor?: number;
  currency?: string;
  channel?: string;
  paidAt?: string;
  gatewayResponse?: string;
  message: string;
  error?: string;
}

export interface PaystackConnectionTestResult {
  ok: boolean;
  configured: boolean;
  mode: PaystackMode;
  message: string;
  error?: string;
}

export function detectPaystackMode(
  publicKey?: string | null,
  secretKey?: string | null
): PaystackMode {
  const pub = String(publicKey || '').trim().toLowerCase();
  const sec = String(secretKey || '').trim().toLowerCase();
  if (sec.startsWith('sk_live_') || pub.startsWith('pk_live_')) return 'live';
  if (sec.startsWith('sk_test_') || pub.startsWith('pk_test_')) return 'test';
  if (sec.length > 0 || pub.length > 0) return 'test';
  return 'unconfigured';
}

export function verifyPaystackWebhookSignature(params: {
  secretKey: string;
  rawBody: Buffer | string;
  signature?: string | null;
}): boolean {
  const secret = (params.secretKey || '').trim();
  const sig = String(params.signature || '').trim().toLowerCase();
  if (!secret || !sig) return false;
  const expected = createHmac('sha512', secret)
    .update(params.rawBody)
    .digest('hex')
    .toLowerCase();
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

export async function initializePaystackTransaction(params: {
  secretKey?: string | null;
  publicKey?: string | null;
  email: string;
  amountMinor: number;
  currency?: string;
  reference: string;
  callbackUrl?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<PaystackInitializeResult> {
  const secretKey = String(params.secretKey || '').trim();
  const mode = detectPaystackMode(params.publicKey, secretKey);

  if (!secretKey) {
    return {
      ok: false,
      configured: false,
      reference: params.reference,
      mode: 'unconfigured',
      message:
        'Paystack Secret Key is not configured for this church tenant. Add it in Admin Dashboard → System Settings → SMS & Paystack Gateways.',
      error: 'PAYSTACK_NOT_CONFIGURED',
    };
  }

  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.max(100, Math.round(params.amountMinor)),
        currency: (params.currency || 'GHS').toUpperCase(),
        reference: params.reference,
        ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
        ...(params.channels && params.channels.length > 0 ? { channels: params.channels } : {}),
        ...(params.metadata ? { metadata: params.metadata } : {}),
      }),
    });

    const data = await resp.json().catch(() => ({} as Record<string, any>));
    if (!resp.ok || data?.status !== true || !data?.data?.authorization_url) {
      return {
        ok: false,
        configured: true,
        reference: params.reference,
        mode,
        message:
          data?.message || `Paystack initialization failed with HTTP ${resp.status}.`,
        error: 'PAYSTACK_INIT_FAILED',
      };
    }

    return {
      ok: true,
      configured: true,
      authorizationUrl: String(data.data.authorization_url),
      accessCode: String(data.data.access_code || ''),
      reference: String(data.data.reference || params.reference),
      mode,
      message: 'Paystack checkout initialized.',
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: true,
      reference: params.reference,
      mode,
      message: err?.message || 'Network error reaching Paystack API.',
      error: 'PAYSTACK_NETWORK_ERROR',
    };
  }
}

export async function verifyPaystackTransaction(params: {
  secretKey?: string | null;
  reference: string;
  fetchImpl?: typeof fetch;
}): Promise<PaystackVerifyResult> {
  const secretKey = String(params.secretKey || '').trim();
  const reference = String(params.reference || '').trim();

  if (!secretKey) {
    return {
      ok: false,
      verified: false,
      status: 'pending',
      reference,
      message: 'Paystack Secret Key is not configured for this church tenant.',
      error: 'PAYSTACK_NOT_CONFIGURED',
    };
  }

  if (!reference) {
    return {
      ok: false,
      verified: false,
      status: 'failed',
      reference,
      message: 'Transaction reference is required for Paystack verification.',
      error: 'REFERENCE_REQUIRED',
    };
  }

  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const payload = await resp.json().catch(() => ({} as Record<string, any>));
    if (!resp.ok || payload?.status !== true || !payload?.data) {
      return {
        ok: false,
        verified: false,
        status: 'pending',
        reference,
        message:
          payload?.message || `Paystack verification failed with HTTP ${resp.status}.`,
        error: 'PAYSTACK_VERIFY_FAILED',
      };
    }

    const txStatus = String(payload.data.status || '').toLowerCase();
    const mappedStatus: 'paid' | 'pending' | 'failed' =
      txStatus === 'success'
        ? 'paid'
        : txStatus === 'failed' || txStatus === 'abandoned' || txStatus === 'reversed'
        ? 'failed'
        : 'pending';

    return {
      ok: true,
      verified: mappedStatus === 'paid',
      status: mappedStatus,
      reference: String(payload.data.reference || reference),
      amountMinor:
        typeof payload.data.amount === 'number' ? payload.data.amount : undefined,
      currency: payload.data.currency ? String(payload.data.currency) : undefined,
      channel: payload.data.channel ? String(payload.data.channel) : undefined,
      paidAt: payload.data.paid_at ? String(payload.data.paid_at) : undefined,
      gatewayResponse: payload.data.gateway_response
        ? String(payload.data.gateway_response)
        : undefined,
      message:
        mappedStatus === 'paid'
          ? 'Payment verified with Paystack.'
          : `Paystack transaction status is "${txStatus || 'pending'}".`,
    };
  } catch (err: any) {
    return {
      ok: false,
      verified: false,
      status: 'pending',
      reference,
      message: err?.message || 'Network error reaching Paystack verify API.',
      error: 'PAYSTACK_NETWORK_ERROR',
    };
  }
}

export async function testPaystackConnection(params: {
  secretKey?: string | null;
  publicKey?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<PaystackConnectionTestResult> {
  const secretKey = String(params.secretKey || '').trim();
  const mode = detectPaystackMode(params.publicKey, secretKey);

  if (!secretKey) {
    return {
      ok: false,
      configured: false,
      mode: 'unconfigured',
      message: 'No Paystack Secret Key is configured for this church tenant.',
      error: 'PAYSTACK_NOT_CONFIGURED',
    };
  }

  const doFetch = params.fetchImpl || fetch;
  try {
    const resp = await doFetch('https://api.paystack.co/transaction?perPage=1', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });
    const data = await resp.json().catch(() => ({} as Record<string, any>));
    if (!resp.ok || data?.status !== true) {
      return {
        ok: false,
        configured: true,
        mode,
        message:
          data?.message ||
          `Paystack rejected the Secret Key (HTTP ${resp.status}). Verify your key in Paystack Dashboard.`,
        error: 'PAYSTACK_AUTH_FAILED',
      };
    }

    return {
      ok: true,
      configured: true,
      mode,
      message: `Paystack ${mode === 'live' ? 'Live' : 'Test'} API connection verified.`,
    };
  } catch (err: any) {
    return {
      ok: false,
      configured: true,
      mode,
      message: err?.message || 'Network error verifying Paystack connection.',
      error: 'PAYSTACK_NETWORK_ERROR',
    };
  }
}
