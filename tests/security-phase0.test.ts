// tests/security-phase0.test.ts - Phase 0 Comprehensive Security Remediation Test Suite
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, type ChurchRole } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('Phase 0 Security Remediation Suite', () => {
  const creatorToken = signToken({
    id: 'creator-root-1',
    email: 'creator@ekklesphere.platform',
    role: 'creator',
    name: 'Platform Creator',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    is_creator: true,
  });

  const adminToken = signToken({
    id: 'user-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    name: 'Church Administrator',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    is_creator: false,
  });

  const memberToken = signToken({
    id: 'm-elena',
    email: 'elena@ekklesphere.church',
    role: 'member',
    name: 'Elena Mends',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    is_creator: false,
  });

  // =========================================================================
  // VULNERABILITY 1: Unauthenticated Token Minting Locked Down
  // =========================================================================
  describe('Vulnerability #1: Token Minting & Role Injection Lockdown', () => {
    it('REJECTS unauthenticated requests to /api/auth/token with 401', async () => {
      const res = await request(app)
        .post('/api/auth/token')
        .send({ role: 'super_admin', email: 'attacker@evil.com' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('PREVENTS role elevation via request body on authenticated token exchange', async () => {
      // Member tries to exchange their token but requests role: "creator" in req.body
      const res = await request(app)
        .post('/api/auth/token')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'creator', is_creator: true });

      expect(res.status).toBe(200);
      // Role MUST remain 'member', derived from the verified token identity, NOT req.body
      expect(res.body.role).toBe('member');
      expect(res.body.isCreator).toBe(false);
      expect(res.body.user.role).toBe('member');
    });
  });

  // =========================================================================
  // VULNERABILITY 2 & 4: Zero-Trust Scoping & Client Header Spoofing
  // =========================================================================
  describe('Vulnerability #2 & #4: Client Header Spoofing Eradication', () => {
    it('IGNORES x-user-role and x-user-id client headers when caller is a member', async () => {
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('x-user-role', 'admin') // Spoofed header
        .set('x-user-id', 'spoofed-admin-id')
        .send({ lat: 5.6037, lng: -0.187 });

      // Must be 403 Forbidden because verified token identity is member
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('forbidden');
    });

    it('PREVENTS tenant boundary crossing via x-tenant-id or x-organization-id headers', async () => {
      // Member attempts to query another tenant's members by forging tenant headers
      const res = await request(app)
        .get('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('x-tenant-id', '99999999-9999-9999-9999-999999999999')
        .set('x-organization-id', '99999999-9999-9999-9999-999999999999');

      // Server rejects cross-organization boundary crossing attempt with 403
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('cross_organization_forbidden');
    });
  });

  // =========================================================================
  // VULNERABILITY 3: Hardcoded Backdoor Eradication
  // =========================================================================
  describe('Vulnerability #3: Hardcoded Backdoors & Personal Email Elevation Eradication', () => {
    it('DENIES super-admin or creator privileges to users based solely on email addresses', async () => {
      // User with personal email "elenamends@gmail.com" but role "member" without creator claim
      const elenaMemberToken = signToken({
        id: 'usr-elena-member',
        email: 'elenamends@gmail.com',
        role: 'member',
        name: 'Elena Mends',
        organization_id: 'e0000000-0000-0000-0000-000000000001',
        is_creator: false,
      });

      const res = await request(app)
        .get('/api/console/overview')
        .set('Authorization', `Bearer ${elenaMemberToken}`);

      // Must be 403 Forbidden! Creator Console requires app_metadata.creator === true
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('creator_required');
    });
  });

  // =========================================================================
  // VULNERABILITY 5: Unauthenticated Endpoints Locked Down
  // =========================================================================
  describe('Vulnerability #5: Unauthenticated PII & Coordinate Endpoints', () => {
    it('REJECTS unauthenticated GET /api/members with 401', async () => {
      const res = await request(app).get('/api/members');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('REJECTS unauthenticated GET /api/live-checkins with 401', async () => {
      const res = await request(app).get('/api/live-checkins');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('REJECTS unauthenticated GET /api/attendance/raw-events with 401', async () => {
      const res = await request(app).get('/api/attendance/raw-events');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });
  });

  // =========================================================================
  // VULNERABILITY 6: Fail-Closed Licensing Middleware
  // =========================================================================
  describe('Vulnerability #6: Fail-Closed Licensing Policy', () => {
    const expiredOrgId = 'e0000000-0000-0000-0000-000000000099';

    it('BLOCKS operational writes when an organization has an expired/suspended license', async () => {
      // Provision a suspended/expired license in platformStore
      await platformStore.createOrganization({
        id: expiredOrgId,
        name: 'Suspended Ministry',
        slug: 'suspended-ministry',
        autoIssueTrial: false,
      });

      await platformStore.issueLicense({
        organizationId: expiredOrgId,
        tier: 'grace_starter',
        billingCycle: 'annual',
        status: 'suspended',
        notes: 'Suspended for test',
      });

      const suspendedAdminToken = signToken({
        id: 'usr-suspended-admin',
        email: 'pastor@suspended.org',
        role: 'admin',
        organization_id: expiredOrgId,
      });

      // Attempt to save premise GPS coordinates on a suspended license
      const res = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${suspendedAdminToken}`)
        .send({
          lat: 5.6037,
          lng: -0.1870,
          churchName: 'Suspended Church',
        });

      // Must fail closed with 402 or 403 license_required / license_expired
      expect([402, 403]).toContain(res.status);
      expect(res.body.error).toMatch(/license/i);
    });
  });

  // =========================================================================
  // VULNERABILITY 7: Platform Owner (/api/console/*) Access Guard
  // =========================================================================
  describe('Vulnerability #7: Creator Console Security Gate', () => {
    it('REJECTS unauthenticated access to /api/console/overview with 401', async () => {
      const res = await request(app).get('/api/console/overview');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('unauthorized');
    });

    it('REJECTS church admin access to /api/console/overview with 403', async () => {
      const res = await request(app)
        .get('/api/console/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('creator_required');
    });

    it('PERMITS verified creator with app_metadata.creator === true to access /api/console/overview', async () => {
      const res = await request(app)
        .get('/api/console/overview')
        .set('Authorization', `Bearer ${creatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.kpis).toBeDefined();
      expect(res.body.organizations).toBeDefined();
    });
  });

  // =========================================================================
  // VULNERABILITY 9: GPS Spoofing & Haversine Integrity
  // =========================================================================
  describe('Vulnerability #9: Anti-Spoofing & Geofence Perimeter Verification', () => {
    it('REJECTS arrival signal marked with isMock: true', async () => {
      const res = await request(app)
        .post('/api/attendance/events')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          clientEventId: '00000000-0000-0000-0000-000000000099',
          type: 'enter',
          source: 'geofence',
          lat: 5.6037,
          lng: -0.1870,
          accuracyM: 5,
          isMock: true,
          deviceTime: new Date().toISOString(),
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('rejected');
      expect(res.body.flag_reasons).toContain('mock_location');
    });
  });
});
