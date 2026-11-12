import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../server';
import { platformStore } from '../src/server/platformStore';
import { TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';

describe('Authentication, Brute-Force Lockout, Rate Limiting & RLS Hardening', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('rejects legacy hardcoded credentials because zero passwords exist in source', async () => {
    const legacyAttempts = [
      { identifier: 'elenamends@gmail.com', password: 'Ekklesphere@2026!' },
      { identifier: 'admin@ekklesphere.church', password: 'AdminPassword@123' },
      { identifier: 'pastor@ekklesphere.church', password: 'PastorPassword@123' },
      { identifier: 'usher@ekklesphere.church', password: 'UsherPassword@123' },
      { identifier: 'elena@ekklesphere.church', password: 'MemberPassword@123' },
    ];

    for (const attempt of legacyAttempts) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.10')
        .send(attempt);

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('registers a member securely, hashes password, and blocks role injection in body', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.11')
      .send({
        firstName: 'Kofi',
        lastName: 'Boateng',
        email: 'kofi.boateng@example.org',
        phone: '0245556677',
        password: 'StrongPassword99!',
        role: 'creator',
        isCreator: true,
        is_creator: true,
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.role).toBe('member');
    expect(regRes.body.isCreator).toBe(false);
    expect(regRes.body.user.role).toBe('member');
    expect(regRes.body.token).toBeTypeOf('string');
    expect(JSON.stringify(regRes.body)).not.toContain('passwordHash');
    expect(JSON.stringify(regRes.body)).not.toContain('passwordSalt');

    // Duplicate registration rejected with 409
    const dupRes = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.11')
      .send({
        firstName: 'Kofi',
        lastName: 'Boateng',
        email: 'kofi.boateng@example.org',
        password: 'StrongPassword99!',
      });
    expect(dupRes.status).toBe(409);

    // Authenticates with valid password and verifies /api/auth/me
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.11')
      .send({
        identifier: 'kofi.boateng@example.org',
        password: 'StrongPassword99!',
        preferredRole: 'admin',
        role: 'creator',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.role).toBe('member');
    expect(loginRes.body.isCreator).toBe(false);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.authenticated).toBe(true);
    expect(meRes.body.user.role).toBe('member');
    expect(meRes.body.isCreator).toBe(false);
  });

  it('rejects weak passwords on registration and wrong passwords on login', async () => {
    const weakRes = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.12')
      .send({
        firstName: 'Ama',
        lastName: 'Mensah',
        email: 'ama.test@example.org',
        password: 'short',
      });
    expect(weakRes.status).toBe(400);

    await platformStore.provisionCredentialRecord({
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
      email: 'staff.test@example.org',
      name: 'Staff Verifier',
      role: 'usher',
      isCreator: false,
      password: 'CorrectUsherPass#1',
    });

    const wrongRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.12')
      .send({
        identifier: 'staff.test@example.org',
        password: 'WrongPassword!',
      });
    expect(wrongRes.status).toBe(401);

    const okRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.12')
      .send({
        identifier: 'staff.test@example.org',
        password: 'CorrectUsherPass#1',
      });
    expect(okRes.status).toBe(200);
    expect(okRes.body.role).toBe('usher');
  });

  it('locks an account with 429 after 5 failed password attempts (brute-force protection)', async () => {
    await platformStore.provisionCredentialRecord({
      organizationId: TEST_ANCHOR_ORGANIZATION_ID,
      email: 'bruteforce@example.org',
      name: 'Lockout Target',
      role: 'admin',
      isCreator: false,
      password: 'VeryStrongSecret!2026',
    });

    // 4 wrong attempts return 401
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.13')
        .send({
          identifier: 'bruteforce@example.org',
          password: `WrongGuess-${i}`,
        });
      expect(res.status).toBe(401);
    }

    // 5th wrong attempt triggers account lockout with 429
    const fifthRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.13')
      .send({
        identifier: 'bruteforce@example.org',
        password: 'WrongGuess-4',
      });
    expect(fifthRes.status).toBe(429);
    expect(fifthRes.body.code).toBe('ACCOUNT_LOCKED');
    expect(fifthRes.headers['retry-after']).toBeDefined();

    // Even the correct password is blocked while the account is locked
    const lockedCorrectRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.13')
      .send({
        identifier: 'bruteforce@example.org',
        password: 'VeryStrongSecret!2026',
      });
    expect(lockedCorrectRes.status).toBe(429);
    expect(lockedCorrectRes.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('enforces Express IP rate limiting on rapid /api/auth/register bursts', async () => {
    let sawRateLimit = false;
    for (let i = 0; i < 12; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .set('x-forwarded-for', '198.51.100.99')
        .send({
          firstName: 'Burst',
          lastName: `User${i}`,
          email: `burst-${i}@example.org`,
          password: 'BurstPassword#2026',
        });
      if (res.status === 429) {
        sawRateLimit = true;
        expect(res.body.code).toBe('REGISTER_RATE_LIMITED');
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  });

  it('includes Supabase RLS credential isolation and role-escalation guards in the new migration', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261114000000_auth_rls_rate_limit_hardening.sql'
    );
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    expect(sql).toContain('create table if not exists public.account_credentials');
    expect(sql).toContain('alter table public.account_credentials enable row level security');
    expect(sql).toContain('revoke all on table public.account_credentials from public, anon, authenticated');
    expect(sql).toContain('using (false)');
    expect(sql).toContain('create table if not exists public.auth_rate_limits');
    expect(sql).toContain('create or replace function public.guard_member_privilege_columns()');
    expect(sql).toContain('Privilege escalation blocked');
    expect(sql).toContain('account_credentials_org_required_for_non_creator');
  });

  it('supports creator login via email, username, and phone from credentials store and env-gated bootstrap', async () => {
    const prevSecret = process.env.CREATOR_BOOTSTRAP_SECRET;
    try {
      // Fail closed when CREATOR_BOOTSTRAP_SECRET is unset
      delete process.env.CREATOR_BOOTSTRAP_SECRET;
      const disabledRes = await request(app)
        .post('/api/auth/bootstrap-creator')
        .set('x-forwarded-for', '198.51.100.71')
        .send({
          email: 'founder@ekklesphere.test',
          password: 'FounderPassword#2026',
        });
      expect(disabledRes.status).toBe(403);
      expect(disabledRes.body.code).toBe('BOOTSTRAP_SECRET_UNCONFIGURED');

      // Enable secret and verify wrong secret is rejected
      process.env.CREATOR_BOOTSTRAP_SECRET = 'SuperSecretBootstrapKey#99';
      const wrongSecretRes = await request(app)
        .post('/api/auth/bootstrap-creator')
        .set('x-forwarded-for', '198.51.100.72')
        .set('x-creator-bootstrap-secret', 'wrong-secret')
        .send({
          email: 'founder@ekklesphere.test',
          password: 'FounderPassword#2026',
        });
      expect(wrongSecretRes.status).toBe(403);
      expect(wrongSecretRes.body.code).toBe('INVALID_BOOTSTRAP_SECRET');

      // Succeeds with valid secret and provisions all creator identifiers
      const okBootRes = await request(app)
        .post('/api/auth/bootstrap-creator')
        .set('x-forwarded-for', '198.51.100.73')
        .set('x-creator-bootstrap-secret', 'SuperSecretBootstrapKey#99')
        .send({
          email: 'founder@ekklesphere.test',
          password: 'FounderPassword#2026',
          username: 'founder_root',
          phone: '0249998877',
          name: 'Sovereign Founder',
        });
      expect(okBootRes.status).toBe(200);
      expect(okBootRes.body.isCreator).toBe(true);
      expect(okBootRes.body.user.username).toBe('founder_root');
      expect(okBootRes.body.user.phoneE164).toBe('+233249998877');

      // Login using username alias
      const byUsernameRes = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.74')
        .send({ identifier: 'founder_root', password: 'FounderPassword#2026' });
      expect(byUsernameRes.status).toBe(200);
      expect(byUsernameRes.body.isCreator).toBe(true);

      // Login using local Ghanaian phone alias
      const byPhoneRes = await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.75')
        .send({ identifier: '0249998877', password: 'FounderPassword#2026' });
      expect(byPhoneRes.status).toBe(200);
      expect(byPhoneRes.body.isCreator).toBe(true);
    } finally {
      if (prevSecret === undefined) delete process.env.CREATOR_BOOTSTRAP_SECRET;
      else process.env.CREATOR_BOOTSTRAP_SECRET = prevSecret;
    }
  });

  it('allows authenticated Creator to rotate credentials in DB while blocking non-creator roles', async () => {
    const memberReg = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.81')
      .send({
        firstName: 'Regular',
        lastName: 'Member',
        email: 'regular.member@example.org',
        password: 'MemberPass#2026',
      });
    expect(memberReg.status).toBe(201);

    // Non-creator member cannot read or update Creator credentials
    const forbiddenPatch = await request(app)
      .patch('/api/console/profile/credentials')
      .set('Authorization', `Bearer ${memberReg.body.token}`)
      .send({
        email: 'hijack@example.org',
        name: 'Hijack',
        password: 'HijackPassword!99',
      });
    expect(forbiddenPatch.status).toBe(403);

    // Provision Creator and sign in
    const seeded = await platformStore.upsertCreatorCredentials({
      email: 'owner.initial@ekklesphere.test',
      username: 'owner_one',
      phone: '+233201112233',
      name: 'Initial Owner',
      password: 'OldCreatorPass#123',
    });

    const getBefore = await request(app)
      .get('/api/console/profile/credentials')
      .set('Authorization', `Bearer ${seeded.token}`);
    expect(getBefore.status).toBe(200);
    expect(getBefore.body.credentials.email).toBe('owner.initial@ekklesphere.test');
    expect(getBefore.body.credentials.username).toBe('owner_one');

    // Rotate email, username, phone, name, and password
    const rotateRes = await request(app)
      .patch('/api/console/profile/credentials')
      .set('Authorization', `Bearer ${seeded.token}`)
      .send({
        name: 'Updated Creator',
        email: 'owner.rotated@ekklesphere.test',
        username: 'owner_two',
        phone: '+233245554433',
        password: 'NewCreatorPass#456',
      });
    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.user.email).toBe('owner.rotated@ekklesphere.test');
    expect(rotateRes.body.user.username).toBe('owner_two');
    expect(rotateRes.body.token).toBeTypeOf('string');

    // Old password must fail; new password must succeed
    const oldPassLogin = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.82')
      .send({ identifier: 'owner_two', password: 'OldCreatorPass#123' });
    expect(oldPassLogin.status).toBe(401);

    const newPassLogin = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.83')
      .send({ identifier: 'owner_two', password: 'NewCreatorPass#456' });
    expect(newPassLogin.status).toBe(200);
    expect(newPassLogin.body.isCreator).toBe(true);
    expect(newPassLogin.body.user.email).toBe('owner.rotated@ekklesphere.test');
  });
});
