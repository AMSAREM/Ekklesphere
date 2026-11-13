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

  it('provisions a tenant-isolated 14-day trial organisation on /api/auth/register-organisation and rejects duplicates', async () => {
    const signupRes = await request(app)
      .post('/api/auth/register-organisation')
      .set('x-forwarded-for', '198.51.100.141')
      .send({
        organizationName: 'Living Grace Tabernacle',
        orgType: 'church',
        city: 'Kumasi',
        country: 'Ghana',
        adminFirstName: 'Kwame',
        adminLastName: 'Osei',
        email: 'kwame.osei@livinggrace.org',
        phone: '0247778899',
        password: 'GraceTrialPassword#2026',
        trialPlan: 'grace_starter',
        role: 'creator',
        isCreator: true,
        is_creator: true,
      });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.role).toBe('admin');
    expect(signupRes.body.isCreator).toBe(false);
    expect(signupRes.body.user.is_creator).toBe(false);
    expect(signupRes.body.organizationId).toBeTypeOf('string');
    expect(signupRes.body.organizationId).not.toBe(TEST_ANCHOR_ORGANIZATION_ID);
    expect(signupRes.body.organization.name).toBe('Living Grace Tabernacle');
    expect(signupRes.body.evaluation.status).toBe('trial');
    expect(signupRes.body.evaluation.daysRemaining).toBeGreaterThanOrEqual(14);
    expect(signupRes.body.evaluation.daysRemaining).toBeLessThanOrEqual(15);
    expect(signupRes.body.license.tier).toBe('grace_starter');
    expect(signupRes.body.token).toBeTypeOf('string');
    expect(JSON.stringify(signupRes.body)).not.toContain('passwordHash');

    // Duplicate email rejected with 409 and does not create another session
    const dupRes = await request(app)
      .post('/api/auth/register-organisation')
      .set('x-forwarded-for', '198.51.100.142')
      .send({
        organizationName: 'Living Grace Clone',
        adminFirstName: 'Kwame',
        adminLastName: 'Osei',
        email: 'kwame.osei@livinggrace.org',
        password: 'GraceTrialPassword#2026',
      });
    expect(dupRes.status).toBe(409);

    // Tenant admin cannot access Creator console
    const consoleRes = await request(app)
      .get('/api/console/dashboard')
      .set('Authorization', `Bearer ${signupRes.body.token}`);
    expect(consoleRes.status).toBe(403);

    // Tenant admin cannot read members belonging to a different organisation
    const crossTenantRes = await request(app)
      .get(`/api/members?organizationId=${TEST_ANCHOR_ORGANIZATION_ID}`)
      .set('Authorization', `Bearer ${signupRes.body.token}`);
    expect(crossTenantRes.status).toBe(403);
  });

  it('allows an organisation admin to inspect plans and upgrade from trial to active Cathedral Enterprise', async () => {
    const signupRes = await request(app)
      .post('/api/auth/register-organisation')
      .set('x-forwarded-for', '198.51.100.151')
      .send({
        organizationName: 'Bethlehem Chapel International',
        orgType: 'church',
        city: 'Accra',
        country: 'Ghana',
        adminFirstName: 'Abena',
        adminLastName: 'Boateng',
        email: 'abena@bethlehemchapel.org',
        password: 'ChapelUpgradePass#2026',
        trialPlan: 'grace_starter',
      });

    expect(signupRes.status).toBe(201);
    const adminToken = signupRes.body.token as string;
    const orgId = signupRes.body.organizationId as string;

    // Member role must be forbidden from viewing plans or upgrading organisation
    const memberReg = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.152')
      .send({
        firstName: 'Regular',
        lastName: 'Parishioner',
        email: 'parishioner.upgrade@example.org',
        password: 'MemberPass#2026',
        organizationId: orgId,
      });
    expect(memberReg.status).toBe(201);

    const memberPlansRes = await request(app)
      .get('/api/organisation/plans')
      .set('Authorization', `Bearer ${memberReg.body.token}`);
    expect(memberPlansRes.status).toBe(403);

    const memberUpgradeRes = await request(app)
      .post('/api/organisation/upgrade')
      .set('Authorization', `Bearer ${memberReg.body.token}`)
      .send({
        tier: 'cathedral_enterprise',
        billingCycle: 'annual',
        paymentMethod: 'momo',
        paymentReference: 'MOMO-UNAUTH-1',
      });
    expect(memberUpgradeRes.status).toBe(403);

    // Admin reads plans & current trial status
    const plansBefore = await request(app)
      .get('/api/organisation/plans')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(plansBefore.status).toBe(200);
    expect(plansBefore.body.plans.length).toBeGreaterThanOrEqual(3);
    expect(plansBefore.body.evaluation.status).toBe('trial');
    expect(plansBefore.body.evaluation.tier).toBe('grace_starter');

    // Admin upgrades to Cathedral Enterprise (annual via MoMo)
    const upgradeRes = await request(app)
      .post('/api/organisation/upgrade')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tier: 'cathedral_enterprise',
        billingCycle: 'annual',
        paymentMethod: 'momo',
        paymentReference: 'MOMO-UPGRADE-2026',
        currency: 'USD',
      });
    expect(upgradeRes.status).toBe(200);
    expect(upgradeRes.body.success).toBe(true);
    expect(upgradeRes.body.evaluation.status).toBe('active');
    expect(upgradeRes.body.evaluation.tier).toBe('cathedral_enterprise');
    expect(upgradeRes.body.evaluation.seatsLimit).toBe(2500);
    expect(upgradeRes.body.evaluation.sitesLimit).toBe(15);
    expect(upgradeRes.body.payment.reference).toBe('MOMO-UPGRADE-2026');

    // Subsequent plans fetch reflects upgraded state
    const plansAfter = await request(app)
      .get('/api/organisation/plans')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(plansAfter.status).toBe(200);
    expect(plansAfter.body.evaluation.status).toBe('active');
    expect(plansAfter.body.evaluation.tier).toBe('cathedral_enterprise');
    expect(plansAfter.body.evaluation.seatsLimit).toBe(2500);
  });

  it('persists uploaded member photos via PATCH /api/members/me/profile and exposes them on /api/auth/me and /api/members', async () => {
    const signupRes = await request(app)
      .post('/api/auth/register-organisation')
      .set('x-forwarded-for', '198.51.100.161')
      .send({
        organizationName: 'Covenant Light Assembly',
        adminFirstName: 'Yaw',
        adminLastName: 'Mensah',
        email: 'yaw.admin@covenantlight.org',
        password: 'CovenantAdmin#2026',
      });
    expect(signupRes.status).toBe(201);
    const adminToken = signupRes.body.token as string;
    const orgId = signupRes.body.organizationId as string;

    const memberReg = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-for', '198.51.100.162')
      .send({
        firstName: 'Akosua',
        lastName: 'Frimpong',
        email: 'akosua.photo@covenantlight.org',
        password: 'AkosuaPhotoPass#2026',
        organizationId: orgId,
      });
    expect(memberReg.status).toBe(201);
    const memberToken = memberReg.body.token as string;

    const sampleAvatarDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/';
    const patchRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        imageUrl: sampleAvatarDataUrl,
        dateOfBirth: '1994-11-13',
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.imageUrl).toBe(sampleAvatarDataUrl);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.avatar).toBe(sampleAvatarDataUrl);
    expect(meRes.body.memberProfile?.imageUrl).toBe(sampleAvatarDataUrl);

    const membersRes = await request(app)
      .get('/api/members')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(membersRes.status).toBe(200);
    const akosua = membersRes.body.find((m: any) => m.email === 'akosua.photo@covenantlight.org');
    expect(akosua).toBeDefined();
    expect(akosua.imageUrl).toBe(sampleAvatarDataUrl);
  });

  it('allows Platform Creator to provision, reset, and unlock an organisation admin login while blocking non-creators', async () => {
    const creator = await platformStore.upsertCreatorCredentials({
      email: 'creator.ops@ekklesphere.test',
      password: 'CreatorMasterPass#2026',
      name: 'Platform Creator',
    });

    // Provision a target organisation without an admin login yet
    const createdOrg = await platformStore.createOrganisation({
      name: 'PIWC Kwadaso Annex',
      city: 'Kumasi',
      country: 'Ghana',
      contactEmail: 'admin@piwckwadaso-annex.org',
      initialPlan: 'cathedral_enterprise',
      autoIssueTrial: true,
    });
    const orgId = createdOrg.organisation.id;

    // 1. Inspect initially empty org admin credentials list
    const initialListRes = await request(app)
      .get(`/api/console/organisations/${orgId}/admin-credentials`)
      .set('Authorization', `Bearer ${creator.token}`);
    expect(initialListRes.status).toBe(200);
    expect(initialListRes.body.credentials).toHaveLength(0);

    // 2. Provision org admin credentials as Creator
    const provisionRes = await request(app)
      .post(`/api/console/organisations/${orgId}/admin-credentials`)
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        fullName: 'Kwadaso Admin',
        email: 'admin@piwckwadaso-annex.org',
        phone: '+233249998877',
        password: 'FirstOrgAdminPass#2026',
        role: 'admin',
      });
    expect(provisionRes.status).toBe(200);
    expect(provisionRes.body.success).toBe(true);
    expect(provisionRes.body.resetExisting).toBe(false);
    expect(provisionRes.body.credential.email).toBe('admin@piwckwadaso-annex.org');
    expect(provisionRes.body.credential.role).toBe('admin');

    // 3. New admin signs in cleanly and is scoped to that organisation
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.171')
      .send({
        identifier: 'admin@piwckwadaso-annex.org',
        password: 'FirstOrgAdminPass#2026',
      });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.role).toBe('admin');
    expect(loginRes.body.isCreator).toBe(false);
    expect(loginRes.body.organizationId).toBe(orgId);

    // 4. Non-creator org admin must be blocked (403) from Console admin-credentials routes
    const blockedRes = await request(app)
      .post(`/api/console/organisations/${orgId}/admin-credentials`)
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        fullName: 'Rogue Admin',
        email: 'rogue@piwckwadaso-annex.org',
        password: 'RoguePassword#2026',
      });
    expect(blockedRes.status).toBe(403);

    // 5. Simulate lockout after 5 wrong passwords, then Creator resets & unlocks
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .set('x-forwarded-for', '198.51.100.172')
        .send({ identifier: 'admin@piwckwadaso-annex.org', password: 'WrongPassword#00' });
    }
    const lockedRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.172')
      .send({ identifier: 'admin@piwckwadaso-annex.org', password: 'FirstOrgAdminPass#2026' });
    expect(lockedRes.status).toBe(429);

    const resetRes = await request(app)
      .post(`/api/console/organisations/${orgId}/admin-credentials`)
      .set('Authorization', `Bearer ${creator.token}`)
      .send({
        fullName: 'Kwadaso Admin',
        email: 'admin@piwckwadaso-annex.org',
        phone: '+233249998877',
        password: 'RotatedOrgAdminPass#2026',
        role: 'admin',
      });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.resetExisting).toBe(true);

    // Unlocked immediately and new password works
    const unlockedLoginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.173')
      .send({
        identifier: '+233249998877',
        password: 'RotatedOrgAdminPass#2026',
      });
    expect(unlockedLoginRes.status).toBe(200);
    expect(unlockedLoginRes.body.organizationId).toBe(orgId);
  });

  it('includes SQL migration linking account_credentials to Supabase Auth users and deleting hardcoded organisations', () => {
    const cleanupMigrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261118000000_remove_hardcoded_organizations.sql'
    );
    const sql = fs.readFileSync(cleanupMigrationPath, 'utf-8');

    expect(sql).toContain('add column if not exists auth_user_id uuid');
    expect(sql).toContain('EKKLE-PIWC-KWADASO-ENT-2026');
    expect(sql).toContain("'piwc-kwadaso'");
    expect(sql).toContain("'primary-church'");
    expect(sql).toContain("'accra-central'");
    expect(sql).toContain("'kumasi-grace'");
    expect(sql).toContain('public.landing_cms_config');
  });
});

