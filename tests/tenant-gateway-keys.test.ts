import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'crypto';
import request from 'supertest';
import { app } from '../server';
import {
  maskSecretTail,
  sealTenantSecret,
  signToken,
  TEST_ANCHOR_ORGANIZATION_ID,
  unsealTenantSecret,
} from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Per-Tenant Encrypted Arkesel & Paystack Gateway Keys', () => {
  const adminToken = signToken({
    id: 'usr-gw-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Church Admin',
  });

  const memberToken = signToken({
    id: 'usr-gw-member-1',
    email: 'member@ekklesphere.church',
    role: 'member',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Church Member',
  });

  const otherOrgId = 'a0000000-0000-4000-8000-000000000099';
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    platformStore.resetForTests();
    delete process.env.ARKESEL_API_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_PUBLIC_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.ARKESEL_API_KEY;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.PAYSTACK_PUBLIC_KEY;
    vi.restoreAllMocks();
  });

  it('seals, unseals, and masks tenant gateway secrets using AES-256-GCM', () => {
    const rawKey = 'sk_live_ekklesphere_9876543210abcd';
    const sealed = sealTenantSecret(rawKey);
    expect(sealed).toMatch(/^tgv1:/);
    expect(sealed).not.toContain(rawKey);
    expect(unsealTenantSecret(sealed)).toBe(rawKey);
    expect(maskSecretTail(rawKey)).toBe('••••abcd');
  });

  it('persists per-tenant Arkesel & Paystack keys write-only, isolates tenants, and blocks non-admins', async () => {
    // Non-admin member cannot update gateway keys
    const forbiddenRes = await request(app)
      .put('/api/system-settings/gateways')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ arkeselApiKey: 'ark_unauthorized_12345' });
    expect(forbiddenRes.status).toBe(403);

    // Admin saves tenant-specific Arkesel + Paystack live keys
    const saveRes = await request(app)
      .put('/api/system-settings/gateways')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        arkeselApiKey: 'ark_tenant_secret_key_7788',
        paystackPublicKey: 'pk_live_tenant_pub_1122',
        paystackSecretKey: 'sk_live_tenant_sec_9944',
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);
    expect(saveRes.body.gateways.arkeselConfigured).toBe(true);
    expect(saveRes.body.gateways.arkeselSource).toBe('tenant');
    expect(saveRes.body.gateways.arkeselKeyMasked).toBe('••••7788');
    expect(saveRes.body.gateways.paystackConfigured).toBe(true);
    expect(saveRes.body.gateways.paystackSource).toBe('tenant');
    expect(saveRes.body.gateways.paystackPublicKey).toBe('pk_live_tenant_pub_1122');
    expect(saveRes.body.gateways.paystackSecretMasked).toBe('••••9944');
    expect(saveRes.body.gateways.paystackMode).toBe('live');

    // Response must NEVER contain plaintext secrets
    const serialized = JSON.stringify(saveRes.body);
    expect(serialized).not.toContain('ark_tenant_secret_key_7788');
    expect(serialized).not.toContain('sk_live_tenant_sec_9944');

    // GET /api/system-settings/gateways confirms write-only masking
    const getRes = await request(app)
      .get('/api/system-settings/gateways')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.gateways.arkeselKeyMasked).toBe('••••7788');
    expect(JSON.stringify(getRes.body)).not.toContain('sk_live_tenant_sec_9944');

    // Member calling /api/communications/status sees publicKey & configured flags, never masked secrets
    const memberStatusRes = await request(app)
      .get('/api/communications/status')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberStatusRes.status).toBe(200);
    expect(memberStatusRes.body.paystackConfigured).toBe(true);
    expect(memberStatusRes.body.paystackPublicKey).toBe('pk_live_tenant_pub_1122');
    expect(memberStatusRes.body.arkeselKeyMasked).toBeNull();
    expect(memberStatusRes.body.paystackSecretMasked).toBeNull();

    // Another tenant remains unconfigured (tenant isolation)
    const otherSummary = await platformStore.getTenantGatewayConfigSummary(otherOrgId);
    expect(otherSummary.arkeselConfigured).toBe(false);
    expect(otherSummary.paystackConfigured).toBe(false);
  });

  it('uses the tenant Arkesel API key when sending test SMS', async () => {
    await request(app)
      .put('/api/system-settings/gateways')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ arkeselApiKey: 'ark_church_only_key_5511' });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: [{ recipient: '233240000111' }] }),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const testSmsRes = await request(app)
      .post('/api/system-settings/test-sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        provider: 'Arkesel SMS',
        senderId: 'ANCHORCH',
        recipientPhone: '0240000111',
      });

    expect(testSmsRes.status).toBe(200);
    expect(testSmsRes.body.mode).toBe('live');
    expect(testSmsRes.body.source).toBe('tenant');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://sms.arkesel.com/api/v2/sms/send');
    expect((init as RequestInit).headers).toMatchObject({
      'api-key': 'ark_church_only_key_5511',
    });
  });

  it('initializes, verifies, and processes signed Paystack webhooks using the tenant secret key', async () => {
    await request(app)
      .put('/api/system-settings/gateways')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paystackPublicKey: 'pk_test_church_pub_001',
        paystackSecretKey: 'sk_test_church_sec_002',
      });

    const fetchSpy = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/transaction/initialize')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              authorization_url: 'https://checkout.paystack.com/ekk-test-checkout',
              access_code: 'acc_test_123',
              reference: 'EKK-TEST-REF-100',
            },
          }),
        } as Response;
      }
      if (target.includes('/transaction/verify/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: true,
            data: {
              status: 'success',
              reference: 'EKK-TEST-REF-100',
              amount: 10000,
              currency: 'GHS',
              channel: 'mobile_money',
              paid_at: '2026-11-17T12:00:00.000Z',
              gateway_response: 'Approved',
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // 1. Member initializes Paystack checkout
    const initRes = await request(app)
      .post('/api/giving/paystack/initialize')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        amountGhs: 100,
        fundName: 'Tithe',
        provider: 'MTN MoMo',
      });

    expect(initRes.status).toBe(200);
    expect(initRes.body.success).toBe(true);
    expect(initRes.body.authorizationUrl).toBe('https://checkout.paystack.com/ekk-test-checkout');
    expect(initRes.body.reference).toBe('EKK-TEST-REF-100');
    expect(initRes.body.donation.status).toBe('pending');
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer sk_test_church_sec_002',
    });

    // 2. Unsigned or wrong-signature Paystack webhook is rejected with 401
    const webhookBody = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: 'EKK-TEST-REF-100',
        channel: 'mobile_money',
        paid_at: '2026-11-17T12:05:00.000Z',
        metadata: { organizationId: TEST_ANCHOR_ORGANIZATION_ID },
      },
    });
    const badSigRes = await request(app)
      .post(`/api/giving/webhooks/paystack/${TEST_ANCHOR_ORGANIZATION_ID}`)
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'deadbeef')
      .send(webhookBody);
    expect(badSigRes.status).toBe(401);

    // 3. Valid HMAC-SHA512 signed webhook marks donation as paid
    const validSignature = createHmac('sha512', 'sk_test_church_sec_002')
      .update(webhookBody)
      .digest('hex');

    const goodWebhookRes = await request(app)
      .post(`/api/giving/webhooks/paystack/${TEST_ANCHOR_ORGANIZATION_ID}`)
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', validSignature)
      .send(webhookBody);
    expect(goodWebhookRes.status).toBe(200);
    expect(goodWebhookRes.body.received).toBe(true);

    // 4. Verify endpoint also confirms paid status
    const verifyRes = await request(app)
      .post('/api/giving/paystack/verify')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reference: 'EKK-TEST-REF-100' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.verified).toBe(true);
    expect(verifyRes.body.status).toBe('paid');
    expect(verifyRes.body.donation.status).toBe('paid');
  });
});
