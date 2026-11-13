// tests/auth-live-production.test.ts
// Live production authentication, role-based access control, and rate limiting test suite
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { verifyToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Live Production Authentication & Role-Based Access Control', () => {
  beforeEach(async () => {
    platformStore.resetForTests();
    await platformStore.provisionCredentialRecord({
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
      email: 'amoakoimml@gmail.com',
      username: 'amoakoimml',
      phoneE164: '+233241234567',
      name: 'Emmanuel Amoako',
      role: 'super_admin',
      isCreator: true,
      password: 'TestAdminSecret#2026',
    });
    await platformStore.provisionCredentialRecord({
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
      email: 'akokosolutions24@gmail.com',
      username: 'akokosolutions',
      phoneE164: '+233241234569',
      name: 'Akoko Solutions Admin',
      role: 'admin',
      isCreator: false,
      password: 'TestStaffSecret#2026',
    });
  });

  it('authenticates provisioned administrator with email and auto-assigns super_admin role and tenant', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.41')
      .send({
        identifier: 'amoakoimml@gmail.com',
        password: 'TestAdminSecret#2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('amoakoimml@gmail.com');
    expect(res.body.role).toBe('super_admin');
    expect(res.body.user.role).toBe('super_admin');
    expect(res.body.isCreator).toBe(true);
    expect(res.body.organizationId).toBe(TEST_ANCHOR_ORGANIZATION_ID);

    const decoded = verifyToken(res.body.token);
    expect(decoded.id).toBe(res.body.user.id);
    expect(decoded.role).toBe('super_admin');
    expect(decoded.is_creator).toBe(true);
  });

  it('authenticates provisioned administrator with username instead of email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.42')
      .send({
        identifier: 'amoakoimml',
        password: 'TestAdminSecret#2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('super_admin');
  });

  it('authenticates with phone number in international E.164 and local format', async () => {
    const resE164 = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.43')
      .send({
        identifier: '+233241234567',
        password: 'TestAdminSecret#2026',
      });

    expect(resE164.status).toBe(200);
    expect(resE164.body.user.role).toBe('super_admin');

    const resLocal = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.43')
      .send({
        identifier: '0241234567',
        password: 'TestAdminSecret#2026',
      });

    expect(resLocal.status).toBe(200);
    expect(resLocal.body.user.name).toBe('Emmanuel Amoako');
  });

  it('authenticates secondary admin akokosolutions24@gmail.com with admin role', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.44')
      .send({
        identifier: 'akokosolutions24@gmail.com',
        password: 'TestStaffSecret#2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects authentication with invalid password (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.45')
      .send({
        identifier: 'amoakoimml@gmail.com',
        password: 'WrongPassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects authentication for non-existent account (401)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.46')
      .send({
        identifier: 'nonexistent-user@ekklesphere.church',
        password: 'SomePassword123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects empty credentials with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.47')
      .send({
        identifier: '',
        password: '',
      });

    expect(res.status).toBe(400);
  });

  it('registers a new member with credentials and verifies subsequent login', async () => {
    const uniqueEmail = `member-${Date.now()}@ekklesphere.church`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.48')
      .send({
        firstName: 'Kofi',
        lastName: 'Mensah',
        email: uniqueEmail,
        phone: '+233245550099',
        password: 'SecurePassword2026!',
        groupName: 'Youth Ministry',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    expect(regRes.body.user.role).toBe('member');
    expect(regRes.body.user.name).toBe('Kofi Mensah');

    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.48')
      .send({
        identifier: uniqueEmail,
        password: 'SecurePassword2026!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('member');
    expect(loginRes.body.user.name).toBe('Kofi Mensah');
  });

  it('enforces rate limiting when repeated failed attempts are sent', async () => {
    const bruteForceTarget = `victim-${Date.now()}@church.org`;
    let lastStatus = 0;

    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.49')
        .send({
          identifier: bruteForceTarget,
          password: 'IncorrectPassword!',
        });
      lastStatus = res.status;
      if (res.status === 429) {
        expect(res.body.error).toBe('rate_limit_exceeded');
        break;
      }
    }

    expect(lastStatus).toBe(429);
  });
});
