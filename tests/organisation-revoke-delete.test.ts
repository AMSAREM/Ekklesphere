// tests/organisation-revoke-delete.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import { churchWallStore } from '../src/server/churchWallStore';

describe('Organisation Revoke, Permanent Deletion & Migration SQL Safety', () => {
  const creatorToken = signToken({
    id: 'creator-root-1',
    email: 'creator@ekklesphere.platform',
    role: 'creator',
    name: 'Platform Creator',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    is_creator: true,
  });

  const anchorAdminToken = signToken({
    id: 'user-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    name: 'Church Administrator',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    is_creator: false,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('guards 20261118000000_remove_hardcoded_organizations.sql dynamically against missing organization_id (e.g. system_settings)', () => {
    const sqlPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261118000000_remove_hardcoded_organizations.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');

    expect(sql).not.toMatch(/delete\s+from\s+public\.system_settings\s+where\s+organization_id/i);
    expect(sql).toContain('information_schema.columns');
    expect(sql).toContain("column_name = 'organization_id'");
    expect(sql).toContain("column_name = 'tenant_id'");
    expect(sql).toContain('public.audit_log');
    expect(sql).toContain('drop constraint if exists');
  });

  it('ensures no SchoolSphere migrations, unsupported psql directives, or duplicate migration version prefixes exist in supabase/migrations', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir).sort();

    expect(files).not.toContain('20261030000004_schoolsphere_master_rls.sql');
    expect(files).toContain('20261030000004_ekklesphere_master_rls.sql');

    const seenVersions = new Map<string, string>();

    for (const file of files) {
      expect(file.toLowerCase()).not.toContain('schoolsphere');
      expect(file.toLowerCase()).not.toContain('school_id');

      if (!file.endsWith('.sql')) continue;

      const versionMatch = file.match(/^(\d+)_/);
      expect(versionMatch, `Expected numeric version prefix on ${file}`).not.toBeNull();
      const version = versionMatch![1];
      expect(
        seenVersions.has(version),
        `Duplicate Supabase migration version ${version}: ${seenVersions.get(version)} vs ${file}`
      ).toBe(false);
      seenVersions.set(version, file);

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      expect(sql).not.toMatch(/schoolsphere|school_id/i);
      expect(sql).not.toMatch(/^\s*\\(?:ir|i|include|set|echo|connect|c)\b/im);
    }
  });

  it('rejects unauthenticated and non-creator calls to revoke and delete endpoints', async () => {
    const unauthRevoke = await request(app)
      .post(`/api/console/organisations/${TEST_ANCHOR_ORGANIZATION_ID}/revoke`)
      .send({ reason: 'Non-payment' });
    expect(unauthRevoke.status).toBe(401);

    const unauthDelete = await request(app).delete(
      `/api/console/organisations/${TEST_ANCHOR_ORGANIZATION_ID}`
    );
    expect(unauthDelete.status).toBe(401);

    const adminRevoke = await request(app)
      .post(`/api/console/organisations/${TEST_ANCHOR_ORGANIZATION_ID}/revoke`)
      .set('Authorization', `Bearer ${anchorAdminToken}`)
      .send({ reason: 'Non-payment' });
    expect(adminRevoke.status).toBe(403);

    const adminDelete = await request(app)
      .delete(`/api/console/organisations/${TEST_ANCHOR_ORGANIZATION_ID}`)
      .set('Authorization', `Bearer ${anchorAdminToken}`);
    expect(adminDelete.status).toBe(403);
  });

  it('revokes an organisation: marks license revoked, suspends org, revokes support grants, and blocks logins & writes', async () => {
    const created = await platformStore.createOrganisation({
      name: 'Revoke Target Assembly',
      slug: 'revoke-target',
      orgType: 'church',
      city: 'Tema',
      country: 'Ghana',
      autoIssueTrial: true,
    });
    const orgId = created.organisation.id;

    await platformStore.provisionOrganisationAdminCredentials({
      organizationId: orgId,
      fullName: 'Target Admin',
      email: 'target-admin@revoke.org',
      password: 'StrongPassword#2026',
      role: 'admin',
    });

    await platformStore.createSupportGrant({
      organizationId: orgId,
      creatorUserId: 'creator-root-1',
      creatorEmail: 'creator@ekklesphere.platform',
      reason: 'Pre-revocation inspection',
      durationMinutes: 30,
    });

    const badReasonRes = await request(app)
      .post(`/api/console/organisations/${orgId}/revoke`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ reason: 'no' });
    expect(badReasonRes.status).toBe(400);

    const revokeRes = await request(app)
      .post(`/api/console/organisations/${orgId}/revoke`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ reason: 'Policy violation & non-renewal' });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.success).toBe(true);
    expect(revokeRes.body.organisation.status).toBe('suspended');
    expect(revokeRes.body.license.status).toBe('revoked');
    expect(revokeRes.body.revokedGrantsCount).toBe(1);
    expect(revokeRes.body.suspendedCredentialsCount).toBe(1);

    // Org admin cannot log in anymore
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.77')
      .send({
        identifier: 'target-admin@revoke.org',
        password: 'StrongPassword#2026',
      });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe('ACCOUNT_INACTIVE');

    // Existing admin JWT fails closed on operational endpoints
    const existingJwt = signToken({
      id: 'target-admin-uid',
      email: 'target-admin@revoke.org',
      role: 'admin',
      organization_id: orgId,
    });
    const writeRes = await request(app)
      .post('/api/campus-premise')
      .set('Authorization', `Bearer ${existingJwt}`)
      .send({ lat: 5.65, lng: -0.02, churchName: 'Revoke Target Assembly' });
    expect(writeRes.status).toBe(403);
    expect(writeRes.body.error).toBe('license_enforcement_blocked');
  });

  it('permanently deletes an organisation and purges all associated records so nothing remains on the server', async () => {
    const created = await platformStore.createOrganisation({
      name: 'Purge Forever Church',
      slug: 'purge-forever',
      orgType: 'church',
      city: 'Takoradi',
      country: 'Ghana',
      autoIssueTrial: true,
    });
    const orgId = created.organisation.id;

    await platformStore.provisionOrganisationAdminCredentials({
      organizationId: orgId,
      fullName: 'Purge Admin',
      email: 'purge-admin@church.org',
      password: 'PurgePassword#2026',
      role: 'admin',
    });

    await platformStore.savePremiseSettings(orgId, {
      churchName: 'Purge Forever Church',
      campusName: 'Takoradi Sanctuary',
      campusAddress: 'Market Circle',
      lat: 4.897,
      lng: -1.758,
      accuracyM: 8,
      innerGeofenceMeters: 80,
      outerGeofenceMeters: 250,
      dwellTimeMinutes: 5,
      updatedBy: 'Purge Admin',
    });

    await churchWallStore.createPost(orgId, {
      authorId: 'member-1',
      authorName: 'Purge Member',
      category: 'testimony',
      message: 'Should be purged on org deletion',
    });

    const delRes = await request(app)
      .delete(`/api/console/organisations/${orgId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ reason: 'Tenant requested complete removal' });

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
    expect(delRes.body.deleted).toBe(true);
    expect(delRes.body.organizationId).toBe(orgId);

    // Organisation is completely gone from detail and list endpoints
    const detailRes = await request(app)
      .get(`/api/console/organisations/${orgId}`)
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(detailRes.status).toBe(404);

    const listRes = await request(app)
      .get('/api/console/organisations')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.organisations.some((o: any) => o.id === orgId)).toBe(false);

    // Licenses & wall posts for deleted org are purged from the server
    const licRes = await request(app)
      .get('/api/console/licenses')
      .set('Authorization', `Bearer ${creatorToken}`);
    expect(licRes.status).toBe(200);
    expect(
      licRes.body.licenses.some(
        (l: any) => (l.organizationId || l.tenantId || '').toLowerCase() === orgId
      )
    ).toBe(false);

    const wallPosts = await churchWallStore.listPosts(orgId);
    expect(wallPosts).toHaveLength(0);

    // Admin login no longer exists (401 INVALID_CREDENTIALS)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('x-forwarded-for', '198.51.100.88')
      .send({
        identifier: 'purge-admin@church.org',
        password: 'PurgePassword#2026',
      });
    expect(loginRes.status).toBe(401);
    expect(loginRes.body.code).toBe('INVALID_CREDENTIALS');
  });
});
