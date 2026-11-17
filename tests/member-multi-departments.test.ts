import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  formatMemberDepartmentsString,
  normalizeMemberDepartmentFields,
  parseMemberDepartments,
  resolveMemberDepartments,
} from '../src/utils/memberDepartments';
import {
  findMatchingChurchGroup,
  memberMatchesChurchGroup,
  mergeSelectableDepartments,
} from '../src/utils/settingsConnections';
import { computeDashboardAnalytics } from '../src/utils/dashboardAnalytics';
import { validateMemberImportBatch } from '../src/shared/memberImportValidation';
import { ChurchGroup, Person } from '../src/types/ekklesphere';

describe('Multi-Department & Multi-Ministry Selection', () => {
  const adminToken = signToken({
    id: 'user-dept-admin',
    email: 'dept-admin@ekklesphere.church',
    role: 'admin',
    name: 'Ministry Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const memberToken = signToken({
    id: 'user-dept-member',
    email: 'kwesi.boadu@ekklesphere.church',
    role: 'member',
    name: 'Kwesi Boadu',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('parses comma/semicolon/pipe lists while preserving ampersands and omitting General Congregation', () => {
    expect(
      parseMemberDepartments('Choir & Music Ministry, Ushering Ministry; Media & IT Team | choir & music ministry')
    ).toEqual(['Choir & Music Ministry', 'Ushering Ministry', 'Media & IT Team']);

    expect(parseMemberDepartments('General Congregation')).toEqual([]);
    expect(parseMemberDepartments(['General', 'Protocol & Security'])).toEqual([
      'Protocol & Security',
    ]);

    expect(formatMemberDepartmentsString([])).toBe('General Congregation');
    expect(
      formatMemberDepartmentsString(['Choir & Music Ministry', 'Protocol & Security'])
    ).toBe('Choir & Music Ministry, Protocol & Security');

    expect(
      normalizeMemberDepartmentFields({
        departments: ['Choir & Music Ministry', 'Evangelism & Outreach'],
      })
    ).toEqual({
      departments: ['Choir & Music Ministry', 'Evangelism & Outreach'],
      department: 'Choir & Music Ministry, Evangelism & Outreach',
    });

    expect(normalizeMemberDepartmentFields({ departments: [] })).toEqual({
      departments: [],
      department: 'General Congregation',
    });
  });

  it('matches members across all assigned departments, extracts individual dropdown choices, and rolls up analytics accurately', () => {
    const groups: ChurchGroup[] = [
      {
        id: 'grp-choir',
        name: 'Choir & Music Ministry',
        category: 'ministry',
        leaderName: 'Abena Boateng',
        description: 'Music & Praise',
        createdAt: '2026-01-01',
        active: true,
      },
      {
        id: 'grp-media',
        name: 'Media & IT Team',
        category: 'department',
        leaderName: 'Kofi Tech',
        description: 'Audio Visual',
        createdAt: '2026-01-01',
        active: true,
      },
      {
        id: 'grp-usher',
        name: 'Ushering Ministry',
        category: 'ministry',
        leaderName: 'Yaw Mensah',
        description: 'Sanctuary Ushers',
        createdAt: '2026-01-01',
        active: true,
      },
    ];

    const multiMember: Person = {
      id: 'm-multi-1',
      tenantId: TEST_ANCHOR_ORGANIZATION_ID,
      firstName: 'Kwesi',
      lastName: 'Boadu',
      phoneE164: '+233244111222',
      groupName: 'Main Sanctuary Cell',
      homeCellGroup: 'Main Sanctuary Cell',
      department: 'Choir & Music Ministry, Media & IT Team',
      departments: ['Choir & Music Ministry', 'Media & IT Team'],
      avatarInitials: 'KB',
      status: 'member',
      consecutiveAbsences: 0,
      autoCheckinOptedIn: true,
      joinedOn: '2026-01-10',
    };

    expect(memberMatchesChurchGroup(multiMember, 'Choir & Music Ministry')).toBe(true);
    expect(memberMatchesChurchGroup(multiMember, 'Media & IT Team')).toBe(true);
    expect(memberMatchesChurchGroup(multiMember, 'Ushering Ministry')).toBe(false);

    const matched = findMatchingChurchGroup(groups, {
      department: resolveMemberDepartments(multiMember),
    });
    expect(matched.ministryGroups.map((g) => g.name)).toEqual([
      'Choir & Music Ministry',
      'Media & IT Team',
    ]);

    const options = mergeSelectableDepartments(groups, [multiMember]);
    expect(options).toContain('Choir & Music Ministry');
    expect(options).toContain('Media & IT Team');
    expect(options).not.toContain('Choir & Music Ministry, Media & IT Team');

    const activeService = {
      id: 'svc-1',
      serviceId: 'def-1',
      campusId: 'campus-1',
      tenantId: TEST_ANCHOR_ORGANIZATION_ID,
      name: 'Sunday Morning Service',
      status: 'open' as const,
      date: '2026-03-01',
      startsAt: '08:30',
      endsAt: '10:30',
      expectedAttendance: 10,
      gracePeriodMinutes: 15,
      checkInMethod: 'hybrid' as const,
      createdAt: '2026-03-01',
    };

    const analytics = computeDashboardAnalytics({
      members: [multiMember],
      churchGroups: groups,
      services: [activeService],
      currentService: activeService,
      attendanceRecords: [
        {
          id: 'att-1',
          campusId: 'campus-1',
          tenantId: TEST_ANCHOR_ORGANIZATION_ID,
          personId: 'm-multi-1',
          serviceInstanceId: 'svc-1',
          method: 'manual',
          checkedInAt: '08:40 AM',
          late: false,
          confidence: 100,
        },
      ],
      followupTasks: [],
      donations: [],
      systemSettings: {
        churchName: 'Grace Sanctuary',
        campusName: 'Main Campus',
        campusAddress: 'Accra Central',
        campusLatitude: 5.56,
        campusLongitude: -0.2,
        campusLocationAccuracyM: 10,
        campusLocationUpdatedAt: '2026-03-01T08:00:00Z',
        timezone: 'Africa/Accra',
        currency: 'GHS',
        seniorPastor: 'Pastor Mensah',
        contactPhone: '+233244000000',
        contactEmail: 'office@grace.church',
        outerGeofenceMeters: 300,
        innerGeofenceMeters: 100,
        dwellTimeMinutes: 5,
        serviceWindowBeforeMinutes: 45,
        serviceWindowAfterMinutes: 30,
        bleBeaconRssiThreshold: -70,
        driveByProtection: true,
        autoAssignCellLeaders: true,
        absenteeThresholdServices: 2,
        firstTimerFollowupHours: 24,
        requireExplicitConsent: false,
        auditLogRetentionDays: 90,
        smsGatewayProvider: 'Hubtel Ghana',
        smsSenderId: 'GRACE',
        enablePushNotifications: true,
      },
    });

    const choirDept = analytics.departments.find((d) => d.name === 'Choir & Music Ministry');
    const mediaDept = analytics.departments.find((d) => d.name === 'Media & IT Team');
    const usherDept = analytics.departments.find((d) => d.name === 'Ushering Ministry');

    expect(choirDept?.totalMembers).toBe(1);
    expect(choirDept?.presentCount).toBe(1);
    expect(mediaDept?.totalMembers).toBe(1);
    expect(mediaDept?.presentCount).toBe(1);
    expect(usherDept?.totalMembers).toBe(0);
  });

  it('parses delimited multi-departments in CSV member import rows', () => {
    const { rows, summary } = validateMemberImportBatch(
      [
        {
          'FIRST NAME': 'Esi',
          'LAST NAME': 'Appiah',
          'PHONE NUMBER': '0244888999',
          DEPARTMENT: 'Choir & Music Ministry; Ushering Ministry',
        },
      ],
      [],
      'skip'
    );

    expect(summary.valid).toBe(1);
    expect(rows[0].data.departments).toEqual([
      'Choir & Music Ministry',
      'Ushering Ministry',
    ]);
    expect(rows[0].data.department).toBe('Choir & Music Ministry, Ushering Ministry');
  });

  it('persists multiple departments/ministries across admin create, admin update, and member self-service endpoints', async () => {
    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Kwesi',
        lastName: 'Boadu',
        email: 'kwesi.boadu@ekklesphere.church',
        phoneE164: '+233244777888',
        departments: ['Choir & Music Ministry', 'Media & IT Team'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.departments).toEqual([
      'Choir & Music Ministry',
      'Media & IT Team',
    ]);
    expect(createRes.body.department).toBe('Choir & Music Ministry, Media & IT Team');

    const memberId = createRes.body.id;

    // Admin update replaces with three departments
    const updateRes = await request(app)
      .put(`/api/members/${memberId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        departments: [
          'Choir & Music Ministry',
          'Media & IT Team',
          'Evangelism & Outreach',
        ],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.departments).toEqual([
      'Choir & Music Ministry',
      'Media & IT Team',
      'Evangelism & Outreach',
    ]);
    expect(updateRes.body.department).toBe(
      'Choir & Music Ministry, Media & IT Team, Evangelism & Outreach'
    );

    // Member self-service portal updates their selected ministries
    const selfPatchRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        departments: ['Ushering Ministry', 'Protocol & Security'],
      });

    expect(selfPatchRes.status).toBe(200);
    const selfProfile = selfPatchRes.body.profile ?? selfPatchRes.body.member ?? selfPatchRes.body;
    expect(selfProfile.departments).toEqual([
      'Ushering Ministry',
      'Protocol & Security',
    ]);
    expect(selfProfile.department).toBe(
      'Ushering Ministry, Protocol & Security'
    );

    // Clearing all departments reverts gracefully to General Congregation
    const clearRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        departments: [],
      });

    expect(clearRes.status).toBe(200);
    const clearedProfile = clearRes.body.profile ?? clearRes.body.member ?? clearRes.body;
    expect(clearedProfile.departments).toEqual([]);
    expect(clearedProfile.department).toBe('General Congregation');
  });
});
