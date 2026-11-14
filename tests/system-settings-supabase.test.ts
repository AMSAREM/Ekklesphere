import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';

describe('System Settings, Church Groups, Gateways & Audit Logs (Multi-Tenant Supabase API)', () => {
  beforeEach(() => {
    platformStore.resetForTests();
  });

  const defaultOrgAdminToken = signToken({
    id: 'sys-admin-1',
    email: 'sysadmin@ekklesphere.church',
    role: 'admin',
    name: 'System Admin',
  });

  const defaultOrgPastorToken = signToken({
    id: 'sys-pastor-1',
    email: 'pastor@ekklesphere.church',
    role: 'pastor',
    name: 'Executive Pastor',
  });

  const defaultOrgUsherToken = signToken({
    id: 'sys-usher-1',
    email: 'usher@ekklesphere.church',
    role: 'usher',
    name: 'Door Steward',
  });

  const defaultOrgMemberToken = signToken({
    id: 'sys-member-1',
    email: 'member@ekklesphere.church',
    role: 'member',
    name: 'Congregation Member',
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('rejects unauthenticated requests to settings, groups, SMS test, and audit logs with 401', async () => {
      const checks = [
        request(app).get('/api/system-settings'),
        request(app).put('/api/system-settings').send({ churchName: 'Unauthorized' }),
        request(app).post('/api/system-settings/reset'),
        request(app).post('/api/system-settings/test-sms').send({ provider: 'Hubtel Ghana', senderId: 'TEST' }),
        request(app).get('/api/system-settings/audit-logs'),
        request(app).get('/api/church-groups'),
        request(app).post('/api/church-groups').send({
          name: 'Choir',
          category: 'ministry',
          leaderName: 'Ama',
        }),
      ];

      const responses = await Promise.all(checks);
      for (const res of responses) {
        expect(res.status).toBe(401);
      }
    });

    it('permits members to read system settings & church groups but forbids mutations and audit log reads (403)', async () => {
      const readSettings = await request(app)
        .get('/api/system-settings')
        .set('Authorization', `Bearer ${defaultOrgMemberToken}`);
      expect(readSettings.status).toBe(200);
      expect(readSettings.body.success).toBe(true);

      const readGroups = await request(app)
        .get('/api/church-groups')
        .set('Authorization', `Bearer ${defaultOrgMemberToken}`);
      expect(readGroups.status).toBe(200);
      expect(Array.isArray(readGroups.body.groups)).toBe(true);

      const deniedMutations = await Promise.all([
        request(app)
          .put('/api/system-settings')
          .set('Authorization', `Bearer ${defaultOrgMemberToken}`)
          .send({ outerGeofenceMeters: 500 }),
        request(app)
          .put('/api/system-settings')
          .set('Authorization', `Bearer ${defaultOrgUsherToken}`)
          .send({ outerGeofenceMeters: 500 }),
        request(app)
          .post('/api/system-settings/reset')
          .set('Authorization', `Bearer ${defaultOrgMemberToken}`),
        request(app)
          .post('/api/system-settings/test-sms')
          .set('Authorization', `Bearer ${defaultOrgMemberToken}`)
          .send({ provider: 'Hubtel Ghana', senderId: 'CHURCH' }),
        request(app)
          .get('/api/system-settings/audit-logs')
          .set('Authorization', `Bearer ${defaultOrgUsherToken}`),
        request(app)
          .post('/api/church-groups')
          .set('Authorization', `Bearer ${defaultOrgUsherToken}`)
          .send({ name: 'Youth', category: 'fellowship', leaderName: 'Kwame' }),
      ]);

      for (const res of deniedMutations) {
        expect(res.status).toBe(403);
      }
    });
  });

  describe('Full System Settings Persistence & Premise Synchronization', () => {
    it('persists every System Settings section and synchronizes coordinates with /api/campus-premise before clean reset', async () => {
      const updatePayload = {
        churchName: 'Grace Cathedral International',
        campusName: 'East Legon Sanctuary',
        campusAddress: '14 Bawaleshie Road, Accra',
        campusLatitude: 5.6352,
        campusLongitude: -0.1554,
        campusLocationAccuracyM: 6.4,
        seniorPastor: 'Rev. Dr. Kofi Mensah',
        contactEmail: 'office@gracecathedral.org',
        contactPhone: '+233 24 555 0199',
        timezone: 'Africa/Lagos (WAT)',
        currency: 'USD ($)',
        outerGeofenceMeters: 450,
        innerGeofenceMeters: 120,
        dwellTimeMinutes: 8,
        serviceWindowBeforeMinutes: 60,
        serviceWindowAfterMinutes: 40,
        bleBeaconRssiThreshold: -65,
        driveByProtection: false,
        absenteeThresholdServices: 3,
        firstTimerFollowupHours: 48,
        autoAssignCellLeaders: false,
        requireExplicitConsent: true,
        auditLogRetentionDays: 180,
        smsGatewayProvider: 'Arkesel SMS',
        smsSenderId: 'GRACECATH',
        enablePushNotifications: true,
      };

      const saveRes = await request(app)
        .put('/api/system-settings')
        .set('Authorization', `Bearer ${defaultOrgAdminToken}`)
        .send(updatePayload);

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);
      expect(saveRes.body.configured).toBe(true);
      expect(saveRes.body.settings).toMatchObject({
        churchName: 'Grace Cathedral International',
        campusName: 'East Legon Sanctuary',
        campusAddress: '14 Bawaleshie Road, Accra',
        campusLatitude: 5.6352,
        campusLongitude: -0.1554,
        seniorPastor: 'Rev. Dr. Kofi Mensah',
        contactEmail: 'office@gracecathedral.org',
        contactPhone: '+233 24 555 0199',
        timezone: 'Africa/Lagos (WAT)',
        currency: 'USD ($)',
        outerGeofenceMeters: 450,
        innerGeofenceMeters: 120,
        dwellTimeMinutes: 8,
        serviceWindowBeforeMinutes: 60,
        serviceWindowAfterMinutes: 40,
        bleBeaconRssiThreshold: -65,
        driveByProtection: false,
        absenteeThresholdServices: 3,
        firstTimerFollowupHours: 48,
        autoAssignCellLeaders: false,
        requireExplicitConsent: true,
        auditLogRetentionDays: 180,
        smsGatewayProvider: 'Arkesel SMS',
        smsSenderId: 'GRACECATH',
        enablePushNotifications: true,
      });

      // Verify /api/system-settings GET returns identical saved state
      const getRes = await request(app)
        .get('/api/system-settings')
        .set('Authorization', `Bearer ${defaultOrgPastorToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.settings.bleBeaconRssiThreshold).toBe(-65);
      expect(getRes.body.settings.absenteeThresholdServices).toBe(3);
      expect(getRes.body.settings.smsSenderId).toBe('GRACECATH');
      expect(getRes.body.settings.auditLogRetentionDays).toBe(180);

      // Verify /api/campus-premise mirrors saved geofence & coordinates
      const premiseRes = await request(app)
        .get('/api/campus-premise')
        .set('Authorization', `Bearer ${defaultOrgMemberToken}`);
      expect(premiseRes.status).toBe(200);
      expect(premiseRes.body.configured).toBe(true);
      expect(premiseRes.body.premiseSettings).toMatchObject({
        churchName: 'Grace Cathedral International',
        campusName: 'East Legon Sanctuary',
        lat: 5.6352,
        lng: -0.1554,
        innerGeofenceMeters: 120,
        outerGeofenceMeters: 450,
        dwellTimeMinutes: 8,
      });

      // Reset to defaults via POST /api/system-settings/reset
      const resetRes = await request(app)
        .post('/api/system-settings/reset')
        .set('Authorization', `Bearer ${defaultOrgAdminToken}`);
      expect(resetRes.status).toBe(200);
      expect(resetRes.body.configured).toBe(false);
      expect(resetRes.body.settings.campusLatitude).toBeNull();
      expect(resetRes.body.settings.campusLongitude).toBeNull();
      expect(resetRes.body.settings.outerGeofenceMeters).toBe(300);
      expect(resetRes.body.settings.innerGeofenceMeters).toBe(100);
      expect(resetRes.body.settings.auditLogRetentionDays).toBe(90);
    });
  });

  describe('SMS Gateway Test Dispatch & Sanitized Audit Logs', () => {
    it('records SMS gateway test & settings mutations in audit logs without exposing raw IP addresses', async () => {
      const smsRes = await request(app)
        .post('/api/system-settings/test-sms')
        .set('Authorization', `Bearer ${defaultOrgPastorToken}`)
        .set('X-Forwarded-For', '198.51.100.77')
        .send({ provider: 'Hubtel Ghana', senderId: 'PIWCMAIN' });

      expect(smsRes.status).toBe(200);
      expect(smsRes.body.success).toBe(true);
      expect(smsRes.body.senderId).toBe('PIWCMAIN');

      const auditRes = await request(app)
        .get('/api/system-settings/audit-logs')
        .set('Authorization', `Bearer ${defaultOrgAdminToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.success).toBe(true);
      const testEntry = auditRes.body.auditLogs.find(
        (l: any) => l.action === 'sms.test_dispatched'
      );
      expect(testEntry).toBeDefined();
      expect(testEntry.metadata.senderId).toBe('PIWCMAIN');
      // Privacy/Security: organisation admin audit endpoint never exposes raw IP addresses
      expect(testEntry.ipAddress).toBeUndefined();
      expect(testEntry.ip_address).toBeUndefined();
    });
  });

  describe('Church Groups CRUD & Strict Multi-Tenant Organisation Isolation', () => {
    it('supports full CRUD for ministries, fellowships & cell groups and isolates data across organisations', async () => {
      // Provision Organisation A and Organisation B
      const orgAReg = await request(app)
        .post('/api/auth/register-organisation')
        .set('X-Forwarded-For', '10.20.1.1')
        .send({
          organizationName: 'Bethel Temple Accra',
          orgType: 'church',
          city: 'Accra',
          country: 'Ghana',
          adminFirstName: 'Daniel',
          adminLastName: 'Osei',
          email: 'daniel@bethel-accra.org',
          password: 'StrongPassword#123',
        });
      expect(orgAReg.status).toBe(201);
      const orgAToken = orgAReg.body.token as string;

      const orgBReg = await request(app)
        .post('/api/auth/register-organisation')
        .set('X-Forwarded-For', '10.20.1.2')
        .send({
          organizationName: 'Living Springs Kumasi',
          orgType: 'church',
          city: 'Kumasi',
          country: 'Ghana',
          adminFirstName: 'Esi',
          adminLastName: 'Mensah',
          email: 'esi@livingsprings-kumasi.org',
          password: 'StrongPassword#123',
        });
      expect(orgBReg.status).toBe(201);
      const orgBToken = orgBReg.body.token as string;

      // Org A updates its own settings
      const orgASave = await request(app)
        .patch('/api/system-settings')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          campusName: 'Cantonments Sanctuary',
          smsSenderId: 'BETHELGH',
          absenteeThresholdServices: 4,
        });
      expect(orgASave.status).toBe(200);

      // Org B reads its settings — must NOT see Org A values
      const orgBGet = await request(app)
        .get('/api/system-settings')
        .set('Authorization', `Bearer ${orgBToken}`);
      expect(orgBGet.status).toBe(200);
      expect(orgBGet.body.settings.churchName).toBe('Living Springs Kumasi');
      expect(orgBGet.body.settings.campusName).not.toBe('Cantonments Sanctuary');
      expect(orgBGet.body.settings.smsSenderId).toBe('EKKLESPHERE');
      expect(orgBGet.body.settings.absenteeThresholdServices).toBe(2);

      // Org A creates a Cell Group
      const createGroupRes = await request(app)
        .post('/api/church-groups')
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          name: 'Airport Residential Cell',
          category: 'cell_group',
          leaderName: 'Elder Kojo Appiah',
          leaderPhone: '+233244112233',
          meetingDay: 'Wednesdays',
          meetingTime: '18:30 - 19:30',
          meetingLocation: '12 Patrice Lumumba Rd',
          description: 'Midweek fellowship and Bible study',
          active: true,
        });
      expect(createGroupRes.status).toBe(201);
      const createdGroupId = createGroupRes.body.group.id;
      expect(createGroupRes.body.group.name).toBe('Airport Residential Cell');

      // Org B cannot see, update, or delete Org A's group
      const orgBGroups = await request(app)
        .get('/api/church-groups')
        .set('Authorization', `Bearer ${orgBToken}`);
      expect(orgBGroups.status).toBe(200);
      expect(orgBGroups.body.groups).toHaveLength(0);

      const crossUpdate = await request(app)
        .put(`/api/church-groups/${createdGroupId}`)
        .set('Authorization', `Bearer ${orgBToken}`)
        .send({ active: false });
      expect(crossUpdate.status).toBe(404);

      const crossDelete = await request(app)
        .delete(`/api/church-groups/${createdGroupId}`)
        .set('Authorization', `Bearer ${orgBToken}`);
      expect(crossDelete.status).toBe(404);

      // Org A updates and toggles status cleanly
      const orgAUpdate = await request(app)
        .put(`/api/church-groups/${createdGroupId}`)
        .set('Authorization', `Bearer ${orgAToken}`)
        .send({
          active: false,
          meetingTime: '19:00 - 20:00',
        });
      expect(orgAUpdate.status).toBe(200);
      expect(orgAUpdate.body.group.active).toBe(false);
      expect(orgAUpdate.body.group.meetingTime).toBe('19:00 - 20:00');

      // Org A deletes the group cleanly
      const orgADelete = await request(app)
        .delete(`/api/church-groups/${createdGroupId}`)
        .set('Authorization', `Bearer ${orgAToken}`);
      expect(orgADelete.status).toBe(200);

      const orgAGroupsAfter = await request(app)
        .get('/api/church-groups')
        .set('Authorization', `Bearer ${orgAToken}`);
      expect(orgAGroupsAfter.status).toBe(200);
      expect(orgAGroupsAfter.body.groups).toHaveLength(0);

      // Org B's audit logs never include Org A's group actions
      const orgBAudit = await request(app)
        .get('/api/system-settings/audit-logs')
        .set('Authorization', `Bearer ${orgBToken}`);
      expect(orgBAudit.status).toBe(200);
      const leaked = orgBAudit.body.auditLogs.find(
        (l: any) => l.targetId === createdGroupId
      );
      expect(leaked).toBeUndefined();
    });

    it('never injects hardcoded placeholder organisation names when churchName is omitted', async () => {
      const saveRes = await request(app)
        .post('/api/campus-premise')
        .set('Authorization', `Bearer ${defaultOrgAdminToken}`)
        .send({
          lat: 5.605,
          lng: -0.189,
          campusName: 'North Campus',
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.premiseSettings?.churchName).toBe('');
      expect(saveRes.body.premiseSettings?.churchName).not.toBe('Ekklesphere Sanctuary');
    });
  });
});
