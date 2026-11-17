import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import {
  sealTemporaryPassword,
  signToken,
  TEST_ANCHOR_ORGANIZATION_ID,
  unsealTemporaryPassword,
} from '../lib/auth';
import { DEFAULT_MEMBER_ONBOARDING_PASSWORD, platformStore } from '../src/server/platformStore';

describe('Member & Staff User Credentials Management (/api/users)', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  const adminToken = signToken({
    id: 'usr-mgmt-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Church Admin',
  });

  const pastorToken = signToken({
    id: 'usr-mgmt-pastor-1',
    email: 'pastor@ekklesphere.church',
    role: 'pastor',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Senior Pastor',
  });

  const usherToken = signToken({
    id: 'usr-mgmt-usher-1',
    email: 'usher@ekklesphere.church',
    role: 'usher',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Head Usher',
  });

  const memberToken = signToken({
    id: 'usr-mgmt-member-1',
    email: 'member@ekklesphere.church',
    role: 'member',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Regular Member',
  });

  describe('RBAC Enforcement & Super Admin Guard', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const checks = await Promise.all([
        request(app).get('/api/users'),
        request(app).post('/api/users/credentials').send({
          fullName: 'Test User',
          email: 'testuser@church.org',
          role: 'member',
        }),
        request(app).patch('/api/users/some-id').send({ role: 'usher' }),
      ]);
      for (const res of checks) {
        expect(res.status).toBe(401);
      }
    });

    it('permits pastor read-only GET /api/users while forbidding member/usher reads and non-admin mutations', async () => {
      const pastorRead = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${pastorToken}`);
      expect(pastorRead.status).toBe(200);
      expect(Array.isArray(pastorRead.body.users)).toBe(true);

      const denied = await Promise.all([
        request(app).get('/api/users').set('Authorization', `Bearer ${memberToken}`),
        request(app).get('/api/users').set('Authorization', `Bearer ${usherToken}`),
        request(app)
          .post('/api/users/credentials')
          .set('Authorization', `Bearer ${pastorToken}`)
          .send({ fullName: 'Blocked', email: 'blocked@church.org', role: 'member' }),
        request(app)
          .patch('/api/users/some-id')
          .set('Authorization', `Bearer ${pastorToken}`)
          .send({ role: 'usher' }),
        request(app)
          .patch('/api/users/some-id')
          .set('Authorization', `Bearer ${memberToken}`)
          .send({ status: 'suspended' }),
      ]);
      for (const res of denied) {
        expect(res.status).toBe(403);
      }
    });

    it('prevents an organisation admin from escalating any user to super_admin', async () => {
      const createRes = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Escalation Target',
          email: 'escalate@ekklesphere.church',
          role: 'super_admin',
        });
      expect(createRes.status).toBe(403);
    });
  });

  describe('Unified Member + Staff Listing, Credential Issuance, Reset & Sign-In', () => {
    it('lists both provisioned and unprovisioned members, issues login credentials, resets password, and verifies login', async () => {
      // 1. Enrolled member WITH email (gets auto-provisioned credentials)
      const withEmailRes = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Abena',
          lastName: 'Osei',
          email: 'abena.osei@grace.org',
          phoneE164: '+233241001122',
          groupName: 'Grace Fellowship',
          autoCheckinOptedIn: true,
        });
      expect(withEmailRes.status).toBe(201);
      const abenaId = withEmailRes.body.id;

      // 2. Enrolled member WITHOUT email or phone (appears as unprovisioned in /api/users)
      const withoutContactRes = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Kojo',
          lastName: 'Appiah',
          groupName: 'Youth Builders',
          autoCheckinOptedIn: false,
        });
      expect(withoutContactRes.status).toBe(201);
      const kojoId = withoutContactRes.body.id;

      const listRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);

      const abenaRow = listRes.body.users.find((u: any) => u.memberId === abenaId || u.id === abenaId);
      const kojoRow = listRes.body.users.find((u: any) => u.memberId === kojoId || u.id === kojoId);

      expect(abenaRow).toBeTruthy();
      expect(abenaRow.hasCredentials).toBe(true);
      expect(abenaRow.credentialStatus).toBe('temp_password');
      expect(abenaRow.temporaryPassword).toBe(DEFAULT_MEMBER_ONBOARDING_PASSWORD);
      expect(abenaRow.accountCategory).toBe('member');
      expect(abenaRow.homeCellGroup).toBe('Grace Fellowship');

      // Pastor read-only GET /api/users must NOT expose working temporary passwords
      const pastorListRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${pastorToken}`);
      expect(pastorListRes.status).toBe(200);
      const abenaForPastor = pastorListRes.body.users.find(
        (u: any) => u.memberId === abenaId || u.id === abenaId
      );
      expect(abenaForPastor?.temporaryPassword).toBeUndefined();

      expect(kojoRow).toBeTruthy();
      expect(kojoRow.hasCredentials).toBe(false);
      expect(kojoRow.credentialStatus).toBe('unprovisioned');
      expect(kojoRow.role).toBe('member');

      // 3. Issue login credentials for unprovisioned Kojo (auto-generated temp password)
      const issueRes = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          memberId: kojoId,
          fullName: 'Kojo Appiah',
          email: 'kojo.appiah@grace.org',
          phone: '+233249998877',
          role: 'member',
        });
      expect(issueRes.status).toBe(201);
      expect(issueRes.body.resetExisting).toBe(false);
      expect(typeof issueRes.body.temporaryPassword).toBe('string');
      expect(issueRes.body.user.hasCredentials).toBe(true);
      expect(issueRes.body.user.credentialStatus).toBe('temp_password');
      expect(issueRes.body.user.temporaryPassword).toBe(issueRes.body.temporaryPassword);
      const tempPw = issueRes.body.temporaryPassword as string;

      // Admin listing reflects Kojo's newly issued working temporary password
      const listAfterIssue = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const kojoAfterIssue = listAfterIssue.body.users.find(
        (u: any) => u.memberId === kojoId || u.id === kojoId
      );
      expect(kojoAfterIssue?.temporaryPassword).toBe(tempPw);

      // 4. Verify Kojo can sign in using the issued temporary password
      const firstLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'kojo.appiah@grace.org', password: tempPw });
      expect(firstLogin.status).toBe(200);
      expect(firstLogin.body.role).toBe('member');
      expect(firstLogin.body.mustChangePassword).toBe(true);

      // Member setting their own personal password clears temporaryPassword from admin view
      const abenaLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'abena.osei@grace.org', password: DEFAULT_MEMBER_ONBOARDING_PASSWORD });
      expect(abenaLogin.status).toBe(200);

      const abenaChangePw = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${abenaLogin.body.token}`)
        .send({
          currentPassword: DEFAULT_MEMBER_ONBOARDING_PASSWORD,
          newPassword: 'AbenaPersonal!2026',
          confirmPassword: 'AbenaPersonal!2026',
        });
      expect(abenaChangePw.status).toBe(200);

      const listAfterAbenaChange = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const abenaAfterChange = listAfterAbenaChange.body.users.find(
        (u: any) => u.memberId === abenaId || u.id === abenaId
      );
      expect(abenaAfterChange?.credentialStatus).toBe('active');
      expect(abenaAfterChange?.mustChangePassword).toBe(false);
      expect(abenaAfterChange?.temporaryPassword).toBeUndefined();

      // 5. Reset Kojo's password with an explicit admin-assigned password (no forced change)
      const resetRes = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          memberId: kojoId,
          fullName: 'Kojo Appiah',
          email: 'kojo.appiah@grace.org',
          role: 'member',
          password: 'NewKojoPassword!2026',
          requirePasswordChange: false,
        });
      expect(resetRes.status).toBe(201);
      expect(resetRes.body.resetExisting).toBe(true);
      expect(resetRes.body.temporaryPassword).toBeUndefined();
      expect(resetRes.body.user.temporaryPassword).toBeUndefined();
      expect(resetRes.body.user.credentialStatus).toBe('active');

      // Old temp password rejected; new password accepted
      const oldPwLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'kojo.appiah@grace.org', password: tempPw });
      expect(oldPwLogin.status).toBe(401);

      const newPwLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'kojo.appiah@grace.org', password: 'NewKojoPassword!2026' });
      expect(newPwLogin.status).toBe(200);
      expect(newPwLogin.body.mustChangePassword).toBe(false);
    });

    it('seals and unseals temporary passwords with AES-256-GCM and rejects tampered ciphertexts', () => {
      const sealed = sealTemporaryPassword('Ek!TempPass2026');
      expect(sealed.startsWith('v1:')).toBe(true);
      expect(sealed).not.toContain('Ek!TempPass2026');
      expect(unsealTemporaryPassword(sealed)).toBe('Ek!TempPass2026');
      expect(unsealTemporaryPassword(`${sealed}tampered`)).toBeUndefined();
    });
  });

  describe('Inline Role Changes, Suspension, Reactivation & Self-Lock Protection', () => {
    it('promotes a member to usher, suspends login access, blocks login, and reactivates access', async () => {
      const provision = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Ama Mensah',
          email: 'ama.mensah@grace.org',
          role: 'member',
          password: 'AmaSecurePass!123',
          requirePasswordChange: false,
        });
      expect(provision.status).toBe(201);
      const userId = provision.body.user.id;

      // Promote role to usher
      const promoteRes = await request(app)
        .patch(`/api/users/${encodeURIComponent(userId)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'usher' });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.user.role).toBe('usher');
      expect(promoteRes.body.user.accountCategory).toBe('staff');

      // Login reflects new usher role
      const usherLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'ama.mensah@grace.org', password: 'AmaSecurePass!123' });
      expect(usherLogin.status).toBe(200);
      expect(usherLogin.body.role).toBe('usher');

      // Suspend Ama's login
      const suspendRes = await request(app)
        .patch(`/api/users/${encodeURIComponent(userId)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'suspended' });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.user.status).toBe('suspended');
      expect(suspendRes.body.user.credentialStatus).toBe('suspended');

      const blockedLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'ama.mensah@grace.org', password: 'AmaSecurePass!123' });
      expect(blockedLogin.status).toBe(403);

      // Reactivate Ama's login
      const reactivateRes = await request(app)
        .patch(`/api/users/${encodeURIComponent(userId)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'active' });
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.user.status).toBe('active');
      expect(reactivateRes.body.user.credentialStatus).toBe('active');

      const restoredLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'ama.mensah@grace.org', password: 'AmaSecurePass!123' });
      expect(restoredLogin.status).toBe(200);
    });

    it('blocks an admin from suspending their own active signed-in account', async () => {
      const selfCred = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Active Self Admin',
          email: 'selfadmin@grace.org',
          role: 'admin',
          password: 'SelfAdminPassword!1',
          requirePasswordChange: false,
        });
      expect(selfCred.status).toBe(201);
      const selfUserId = selfCred.body.user.id;
      const selfLogin = await request(app)
        .post('/api/auth/login')
        .send({ identifier: 'selfadmin@grace.org', password: 'SelfAdminPassword!1' });
      expect(selfLogin.status).toBe(200);

      const selfSuspendRes = await request(app)
        .patch(`/api/users/${encodeURIComponent(selfUserId)}`)
        .set('Authorization', `Bearer ${selfLogin.body.token}`)
        .send({ status: 'suspended' });
      expect(selfSuspendRes.status).toBe(400);
    });
  });

  describe('Multi-Tenant Isolation Between Organisations', () => {
    it('prevents cross-organisation reads, credential modifications, and duplicate cross-org identifier hijacking', async () => {
      const orgBResult = await platformStore.createOrganisation({
        name: 'Victory Chapel International',
        orgType: 'church',
        country: 'Ghana',
        city: 'Kumasi',
        contactName: 'Pastor Mensah',
        contactEmail: 'victory@chapel.org',
      });

      const orgBAdminToken = signToken({
        id: 'org-b-admin-1',
        email: 'victory@chapel.org',
        role: 'admin',
        organization_id: orgBResult.organisation.id,
        name: 'Victory Admin',
      });

      // Org A creates a member & credential
      const orgAMember = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Org A Member',
          email: 'orga.member@grace.org',
          role: 'member',
          password: 'OrgAMemberPass!1',
        });
      expect(orgAMember.status).toBe(201);
      const orgAUserId = orgAMember.body.user.id;

      // Org B list must not expose Org A users
      const orgBList = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${orgBAdminToken}`);
      expect(orgBList.status).toBe(200);
      expect(orgBList.body.users.some((u: any) => u.id === orgAUserId)).toBe(false);

      // Org B cannot mutate Org A user account by ID
      const crossPatch = await request(app)
        .patch(`/api/users/${encodeURIComponent(orgAUserId)}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({ role: 'admin' });
      expect(crossPatch.status).toBe(404);

      // Org B cannot hijack Org A's email
      const duplicateEmailAttempt = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({
          fullName: 'Hijacker',
          email: 'orga.member@grace.org',
          role: 'member',
        });
      expect(duplicateEmailAttempt.status).toBe(409);
    });
  });
});
