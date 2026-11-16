import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  normalizeArkeselPhone,
  sendArkeselSms,
  sendResendEmail,
  buildHtmlFromPlainText,
  getCommunicationGatewayStatus,
} from '../src/server/communicationsService';
import {
  CHURCH_PORTFOLIOS,
  getMemberPortfolio,
  isPastoralOfficerOrLeader,
} from '../src/constants/portfolios';
import { buildTelHref, normalizeDialablePhone, formatPhoneForDisplay } from '../src/utils/phoneCall';
import { buildAutoAssignAbsenteesPlan, resolveFollowupAssignee } from '../src/utils/settingsConnections';
import { computeDashboardAnalytics } from '../src/utils/dashboardAnalytics';
import { ChurchGroup, FollowupTask, Person, ServiceInstance, SystemSettings } from '../src/types/ekklesphere';

const baseSettings: SystemSettings = {
  churchName: 'Grace Tabernacle',
  campusName: 'Main Sanctuary',
  campusAddress: 'Accra Central',
  campusLatitude: null,
  campusLongitude: null,
  campusLocationAccuracyM: null,
  campusLocationUpdatedAt: null,
  seniorPastor: 'Rev. Daniel Mensah',
  contactEmail: 'office@gracetabernacle.org',
  contactPhone: '+233240001111',
  timezone: 'Africa/Accra (GMT)',
  currency: 'GHS (Ghana Cedi)',
  outerGeofenceMeters: 300,
  innerGeofenceMeters: 100,
  dwellTimeMinutes: 5,
  serviceWindowBeforeMinutes: 45,
  serviceWindowAfterMinutes: 30,
  bleBeaconRssiThreshold: -70,
  driveByProtection: true,
  absenteeThresholdServices: 2,
  firstTimerFollowupHours: 24,
  autoAssignCellLeaders: true,
  requireExplicitConsent: true,
  auditLogRetentionDays: 90,
  smsGatewayProvider: 'Arkesel SMS',
  smsSenderId: 'GRACECH',
  emailGatewayProvider: 'Resend Email',
  emailFromAddress: 'care@gracetabernacle.org',
  emailSenderName: 'Grace Tabernacle Care',
  enablePushNotifications: true,
};

describe('Communications (Arkesel + Resend), Portfolios, Absentee Auto-Assign, Call & Visitors', () => {
  const adminToken = signToken({
    id: 'usr-comm-admin-1',
    email: 'admin@ekklesphere.church',
    role: 'admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
    name: 'Church Admin',
  });

  const savedEnv = {
    ARKESEL_API_KEY: process.env.ARKESEL_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  };
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    platformStore.resetForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (savedEnv.ARKESEL_API_KEY === undefined) delete process.env.ARKESEL_API_KEY;
    else process.env.ARKESEL_API_KEY = savedEnv.ARKESEL_API_KEY;
    if (savedEnv.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = savedEnv.RESEND_API_KEY;
    if (savedEnv.RESEND_FROM_EMAIL === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = savedEnv.RESEND_FROM_EMAIL;
    vi.restoreAllMocks();
  });

  describe('Arkesel SMS & Resend Email Services', () => {
    it('normalizes local Ghana and international phone numbers for Arkesel', () => {
      expect(normalizeArkeselPhone('024 123 4567')).toBe('233241234567');
      expect(normalizeArkeselPhone('+233501112233')).toBe('233501112233');
      expect(normalizeArkeselPhone('00233209998877')).toBe('233209998877');
      expect(normalizeArkeselPhone('123')).toBeNull();
    });

    it('returns ARKESEL_NOT_CONFIGURED cleanly when server key is missing', async () => {
      delete process.env.ARKESEL_API_KEY;
      const res = await sendArkeselSms({
        senderId: 'GRACECH',
        recipients: ['0244112233'],
        message: 'Service starts at 8am',
      });
      expect(res.ok).toBe(false);
      expect(res.configured).toBe(false);
      expect(res.error).toBe('ARKESEL_NOT_CONFIGURED');
    });

    it('transmits deduplicated SMS recipients to Arkesel v2 API with api-key header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: [{ recipient: '233244112233' }] }),
      });

      const res = await sendArkeselSms({
        apiKey: 'arkesel-test-key',
        senderId: 'GraceChurch!',
        recipients: ['0244112233', '+233244112233', 'bad', '+233501234567'],
        message: 'Midweek Prayer tonight at 6:30 PM',
        fetchImpl: mockFetch as unknown as typeof fetch,
      });

      expect(res.ok).toBe(true);
      expect(res.sentCount).toBe(2);
      expect(res.invalidCount).toBe(1);
      expect(res.senderId).toBe('GRACECHURCH');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://sms.arkesel.com/api/v2/sms/send');
      expect((init as RequestInit).headers).toMatchObject({ 'api-key': 'arkesel-test-key' });
      const payload = JSON.parse(String((init as RequestInit).body));
      expect(payload.recipients).toEqual(['233244112233', '233501234567']);
    });

    it('sends single and batch emails via Resend Email API and escapes HTML', async () => {
      const html = buildHtmlFromPlainText('Care <Notice>', 'Hello <Member>\n\nGod bless you!', 'Grace & Peace');
      expect(html).not.toContain('<Notice>');
      expect(html).toContain('&lt;Notice&gt;');
      expect(html).toContain('Grace &amp; Peace');

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_123', data: [{ id: 'e1' }, { id: 'e2' }] }),
      });

      const singleRes = await sendResendEmail({
        apiKey: 're_test_key',
        fromEmail: 'care@grace.org',
        fromName: 'Grace Care',
        to: ['member@grace.org'],
        subject: 'We missed you',
        text: 'Checking in on you this week.',
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      expect(singleRes.ok).toBe(true);
      expect(singleRes.sentCount).toBe(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.resend.com/emails');

      const batchRes = await sendResendEmail({
        apiKey: 're_test_key',
        fromEmail: 'care@grace.org',
        fromName: 'Grace Care',
        to: ['one@grace.org', 'TWO@grace.org', 'one@grace.org'],
        subject: 'Officers Meeting',
        text: 'Prayer & planning at 5pm.',
        fetchImpl: mockFetch as unknown as typeof fetch,
      });
      expect(batchRes.ok).toBe(true);
      expect(batchRes.sentCount).toBe(2);
      expect(mockFetch.mock.calls[1][0]).toBe('https://api.resend.com/emails/batch');
    });

    it('exposes /api/communications/status, /api/system-settings/test-email & /api/communications/broadcast', async () => {
      delete process.env.ARKESEL_API_KEY;
      delete process.env.RESEND_API_KEY;

      const statusRes = await request(app)
        .get('/api/communications/status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.arkeselConfigured).toBe(false);
      expect(statusRes.body.resendConfigured).toBe(false);

      const unconfiguredEmail = await request(app)
        .post('/api/system-settings/test-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ recipientEmail: 'pastor@grace.org' });
      expect(unconfiguredEmail.status).toBe(400);
      expect(unconfiguredEmail.body.configured).toBe(false);

      // Enable mock fetch + env keys for live test & broadcast dispatch
      process.env.ARKESEL_API_KEY = 'arkesel-live-test';
      process.env.RESEND_API_KEY = 're_live_test';
      expect(getCommunicationGatewayStatus().arkeselConfigured).toBe(true);
      expect(getCommunicationGatewayStatus().resendConfigured).toBe(true);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', id: 'resend_msg_99', data: [{ id: 'resend_msg_99' }] }),
      }) as unknown as typeof fetch;

      await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Kofi',
          lastName: 'Boateng',
          email: 'kofi@grace.org',
          phoneE164: '+233245550001',
          officerName: 'Deacon',
          designation: 'Deacon',
          status: 'member',
        });

      const emailTest = await request(app)
        .post('/api/system-settings/test-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ recipientEmail: 'kofi@grace.org' });
      expect(emailTest.status).toBe(200);
      expect(emailTest.body.success).toBe(true);

      const smsBroadcast = await request(app)
        .post('/api/communications/broadcast')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          channel: 'sms',
          audience: 'officers',
          subject: 'Officers Brief',
          body: 'Deacons & Elders meeting after service.',
        });
      expect(smsBroadcast.status).toBe(200);
      expect(smsBroadcast.body.success).toBe(true);
      expect(smsBroadcast.body.provider).toBe('Arkesel SMS');
      expect(smsBroadcast.body.sentCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Church Portfolios / Designations', () => {
    it('identifies church officers & leaders across Deacon, Deaconess, Elder, and Clergy titles', () => {
      expect(CHURCH_PORTFOLIOS).toContain('Deacon');
      expect(CHURCH_PORTFOLIOS).toContain('Deaconess');
      expect(CHURCH_PORTFOLIOS).toContain('Elder');
      expect(isPastoralOfficerOrLeader({ officerName: 'Deacon', status: 'member' })).toBe(true);
      expect(isPastoralOfficerOrLeader({ designation: 'Deaconess', status: 'member' })).toBe(true);
      expect(isPastoralOfficerOrLeader({ officerName: 'Presiding Elder', status: 'member' })).toBe(true);
      expect(isPastoralOfficerOrLeader({ officerName: 'Member', status: 'member' })).toBe(false);
      expect(isPastoralOfficerOrLeader({ officerName: 'Elder', status: 'visitor' })).toBe(false);
      expect(getMemberPortfolio({ status: 'visitor' })).toBe('Guest');
    });

    it('persists church designation on /api/users/credentials and PATCH /api/users/:id', async () => {
      const createRes = await request(app)
        .post('/api/users/credentials')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          fullName: 'Comfort Owusu',
          email: 'comfort.owusu@grace.org',
          phone: '+233249991122',
          role: 'group_leader',
          designation: 'Deaconess',
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.user.designation).toBe('Deaconess');

      const userId = createRes.body.user.id;
      const patchRes = await request(app)
        .patch(`/api/users/${encodeURIComponent(userId)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ designation: 'Elder' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.user.designation).toBe('Elder');

      const listRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      const found = listRes.body.users.find((u: any) => u.id === userId);
      expect(found?.designation).toBe('Elder');
    });
  });

  describe('Automatic Absentee Assignment to Officers & Leaders', () => {
    it('routes absentees to cell leaders first and load-balances fallback across Officers', () => {
      const officersAndMembers: Person[] = [
        {
          id: 'off-1',
          tenantId: 't1',
          firstName: 'Samuel',
          lastName: 'Osei',
          phoneE164: '+233240001001',
          groupName: 'Grace Cell',
          homeCellGroup: 'Grace Cell',
          officerName: 'Deacon',
          designation: 'Deacon',
          status: 'member',
          autoCheckinOptedIn: true,
          avatarInitials: 'SO',
          joinedOn: '2024-01-01',
          consecutiveAbsences: 0,
        },
        {
          id: 'off-2',
          tenantId: 't1',
          firstName: 'Martha',
          lastName: 'Mensah',
          phoneE164: '+233240001002',
          groupName: 'Faith Cell',
          homeCellGroup: 'Faith Cell',
          officerName: 'Deaconess',
          designation: 'Deaconess',
          status: 'member',
          autoCheckinOptedIn: true,
          avatarInitials: 'MM',
          joinedOn: '2024-01-01',
          consecutiveAbsences: 0,
        },
        {
          id: 'abs-1',
          tenantId: 't1',
          firstName: 'Kojo',
          lastName: 'Appiah',
          phoneE164: '+233240002001',
          groupName: 'Grace Cell',
          homeCellGroup: 'Grace Cell',
          officerName: 'Member',
          status: 'member',
          autoCheckinOptedIn: false,
          avatarInitials: 'KA',
          joinedOn: '2024-02-01',
          consecutiveAbsences: 2,
        },
        {
          id: 'abs-2',
          tenantId: 't1',
          firstName: 'Ama',
          lastName: 'Serwaa',
          phoneE164: '+233240002002',
          groupName: 'Joy Cell',
          homeCellGroup: 'Joy Cell',
          officerName: 'Member',
          status: 'member',
          autoCheckinOptedIn: false,
          avatarInitials: 'AS',
          joinedOn: '2024-02-01',
          consecutiveAbsences: 2,
        },
        {
          id: 'abs-3',
          tenantId: 't1',
          firstName: 'Yaw',
          lastName: 'Kwarteng',
          phoneE164: '+233240002003',
          groupName: 'Hope Cell',
          homeCellGroup: 'Hope Cell',
          officerName: 'Member',
          status: 'member',
          autoCheckinOptedIn: false,
          avatarInitials: 'YK',
          joinedOn: '2024-02-01',
          consecutiveAbsences: 3,
        },
      ];

      const groups: ChurchGroup[] = [
        {
          id: 'grp-1',
          name: 'Grace Cell',
          category: 'cell_group',
          leaderName: 'Samuel Osei',
          leaderPhone: '+233240001001',
          description: 'Grace Sanctuary home cell',
          active: true,
          createdAt: '2024-01-01',
        },
      ];

      const plan = buildAutoAssignAbsenteesPlan({
        members: officersAndMembers,
        churchGroups: groups,
        existingTasks: [],
        systemSettings: baseSettings,
      });

      expect(plan).toHaveLength(3);
      const kojoTask = plan.find((p) => p.personId === 'abs-1');
      expect(kojoTask?.assignedToName).toBe('Samuel Osei');
      expect(kojoTask?.assignedToRole).toBe('Deacon');

      // abs-2 has no cell group leader match -> balanced to Martha Mensah (Deaconess, 0 open tasks)
      // abs-3 (3 consecutive absences) escalates to Senior Pastor when configured
      const amaTask = plan.find((p) => p.personId === 'abs-2');
      const yawTask = plan.find((p) => p.personId === 'abs-3');
      expect(amaTask?.assignedToName).toBe('Martha Mensah');
      expect(amaTask?.assignedToRole).toBe('Deaconess');
      expect(yawTask?.assignedToName).toBe('Rev. Daniel Mensah');
      expect(yawTask?.assignedToRole).toBe('Senior Pastor');
    });

    it('auto-assigns absentee members via /api/followup-tasks/auto-assign-absentees idempotently', async () => {
      await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Elder',
          lastName: 'Adjei',
          email: 'elder.adjei@grace.org',
          phoneE164: '+233240009001',
          officerName: 'Elder',
          designation: 'Elder',
          groupName: 'Shalom Cell',
          status: 'member',
        });

      const absenteeRes = await request(app)
        .post('/api/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Akosua',
          lastName: 'Danso',
          phoneE164: '+233240009002',
          officerName: 'Member',
          groupName: 'Shalom Cell',
          status: 'member',
        });
      expect(absenteeRes.status).toBe(201);

      const updateAbsenceRes = await request(app)
        .put(`/api/members/${encodeURIComponent(absenteeRes.body.id)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ consecutiveAbsences: 2 });
      expect(updateAbsenceRes.status).toBe(200);

      const firstRun = await request(app)
        .post('/api/followup-tasks/auto-assign-absentees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(firstRun.status).toBe(200);
      expect(firstRun.body.success).toBe(true);
      expect(firstRun.body.assignedCount).toBe(1);
      expect(firstRun.body.tasks[0].assignedToName).toBe('Elder Adjei');
      expect(firstRun.body.tasks[0].assignedToRole).toBe('Elder');
      expect(firstRun.body.tasks[0].autoAssigned).toBe(true);

      // Second run must be idempotent and skip existing open task
      const secondRun = await request(app)
        .post('/api/followup-tasks/auto-assign-absentees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(secondRun.status).toBe(200);
      expect(secondRun.body.assignedCount).toBe(0);
      expect(secondRun.body.skippedExistingCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Call Helper & Visitor/Officer Analytics', () => {
    it('builds valid tel: URIs and display labels cleanly', () => {
      expect(normalizeDialablePhone('0244 123 456')).toBe('+233244123456');
      expect(buildTelHref('0244 123 456')).toBe('tel:+233244123456');
      expect(buildTelHref('+233 (50) 987-6543')).toBe('tel:+233509876543');
      expect(buildTelHref('')).toBeNull();
      expect(formatPhoneForDisplay('')).toBe('No phone number');
    });

    it('computes visitorsCount, serviceVisitorsCount, and officersCount accurately', () => {
      const service: ServiceInstance = {
        id: 'svc-1',
        serviceId: 'def-1',
        campusId: 'camp-1',
        name: 'Sunday First Service',
        date: '2026-11-15',
        startsAt: '08:00',
        endsAt: '10:30',
        status: 'open',
        expectedAttendance: 100,
      };
      const roster: Person[] = [
        {
          id: 'm1',
          tenantId: 't1',
          firstName: 'John',
          lastName: 'Doe',
          phoneE164: '+233240000001',
          groupName: 'Grace',
          officerName: 'Deacon',
          status: 'member',
          autoCheckinOptedIn: true,
          avatarInitials: 'JD',
          joinedOn: '2025-01-01',
          consecutiveAbsences: 0,
        },
        {
          id: 'v1',
          tenantId: 't1',
          firstName: 'First',
          lastName: 'Visitor',
          phoneE164: '+233240000002',
          groupName: 'First-Time Visitor',
          officerName: 'Guest',
          status: 'visitor',
          autoCheckinOptedIn: false,
          avatarInitials: 'FV',
          joinedOn: '2026-11-15',
          consecutiveAbsences: 0,
        },
        {
          id: 'v2',
          tenantId: 't1',
          firstName: 'Second',
          lastName: 'Visitor',
          phoneE164: '+233240000003',
          groupName: 'First-Time Visitor',
          officerName: 'Guest',
          status: 'visitor',
          autoCheckinOptedIn: false,
          avatarInitials: 'SV',
          joinedOn: '2026-11-08',
          consecutiveAbsences: 0,
        },
      ];

      const summary = computeDashboardAnalytics({
        members: roster,
        attendanceRecords: [
          {
            id: 'att-1',
            tenantId: 't1',
            personId: 'v1',
            serviceInstanceId: 'svc-1',
            campusId: 'camp-1',
            method: 'usher',
            confidence: 100,
            checkedInAt: '08:10',
            late: false,
          },
        ],
        services: [service],
        currentService: service,
        churchGroups: [],
        followupTasks: [],
        donations: [],
        systemSettings: baseSettings,
      });

      expect(summary.membership.visitorsCount).toBe(2);
      expect(summary.membership.serviceVisitorsCount).toBe(1);
      expect(summary.membership.officersCount).toBe(1);
    });
  });
});
