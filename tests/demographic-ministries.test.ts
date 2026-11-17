import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  computeMemberAge,
  getAutomaticMinistryKind,
  isYouthUnder35,
  MEN_MINISTRY_LABEL,
  resolveAutomaticDemographicMinistries,
  resolveMemberAllDepartmentsAndMinistries,
  WOMEN_MINISTRY_LABEL,
  YOUTH_MINISTRY_LABEL,
} from '../src/utils/demographicMinistries';
import {
  expandAllAutomaticChurchGroups,
  getAllGroupCategories,
  mergeDemographicMinistries,
} from '../src/shared/groupCategories';
import {
  findMatchingChurchGroup,
  memberMatchesChurchGroup,
} from '../src/utils/settingsConnections';
import { computeDashboardAnalytics } from '../src/utils/dashboardAnalytics';
import { ChurchGroup, Person, ServiceInstance, SystemSettings } from '../src/types/ekklesphere';

const baseSettings: SystemSettings = {
  churchName: 'Grace Sanctuary',
  campusName: 'Main Campus',
  campusAddress: 'Accra Central',
  campusLatitude: 5.56,
  campusLongitude: -0.2,
  campusLocationAccuracyM: 10,
  campusLocationUpdatedAt: '2026-11-01T08:00:00Z',
  seniorPastor: 'Rev. Mensah',
  contactEmail: 'admin@grace.church',
  contactPhone: '+233240000000',
  timezone: 'Africa/Accra',
  currency: 'GHS',
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
  smsGatewayProvider: 'Hubtel Ghana',
  smsSenderId: 'GRACE',
  enablePushNotifications: true,
};

function makePerson(overrides: Partial<Person> & { id: string; firstName: string }): Person {
  return {
    tenantId: TEST_ANCHOR_ORGANIZATION_ID,
    lastName: 'Member',
    phoneE164: '+233241000000',
    groupName: 'Main Cell',
    homeCellGroup: 'Main Cell',
    status: 'member',
    avatarInitials: overrides.firstName.slice(0, 2).toUpperCase(),
    joinedOn: '2026-01-01',
    autoCheckinOptedIn: true,
    consecutiveAbsences: 0,
    ...overrides,
  };
}

describe('Automatic Women’s, Men’s & Youth (< 35) Ministries', () => {
  const adminToken = signToken({
    id: 'user-demo-admin',
    email: 'demo-admin@ekklesphere.church',
    role: 'admin',
    name: 'Demo Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('computes age and Youth (< 35) boundaries accurately including exact 35th birthday', () => {
    const refDate = new Date(2026, 10, 15); // 2026-11-15

    // Born 1991-11-16 -> turns 35 tomorrow -> currently 34 -> under 35 (Youth)
    expect(computeMemberAge('1991-11-16', refDate)).toBe(34);
    expect(isYouthUnder35('1991-11-16', refDate)).toBe(true);

    // Born 1991-11-15 -> 35th birthday today -> NOT under 35
    expect(computeMemberAge('1991-11-15', refDate)).toBe(35);
    expect(isYouthUnder35('1991-11-15', refDate)).toBe(false);

    // Born 1984-04-10 -> age 42 -> NOT youth
    expect(computeMemberAge('1984-04-10', refDate)).toBe(42);
    expect(isYouthUnder35('1984-04-10', refDate)).toBe(false);

    // Born 2002-06-01 -> age 24 -> Youth
    expect(computeMemberAge('2002-06-01', refDate)).toBe(24);
    expect(isYouthUnder35('2002-06-01', refDate)).toBe(true);

    // Missing/invalid DOB -> null age, false
    expect(computeMemberAge('', refDate)).toBeNull();
    expect(isYouthUnder35('', refDate)).toBe(false);
  });

  it('assigns Women’s Ministry, Men’s Ministry, and Youth Ministry (< 35) automatically without duplicating manual choices', () => {
    const refDate = new Date(2026, 10, 15);

    // 26-year-old woman -> Women's Ministry + Youth Ministry
    const youngWoman = resolveAutomaticDemographicMinistries(
      { gender: 'female', dateOfBirth: '2000-03-10' },
      refDate
    );
    expect(youngWoman.names).toEqual([WOMEN_MINISTRY_LABEL, YOUTH_MINISTRY_LABEL]);

    // 29-year-old man -> Men's Ministry + Youth Ministry
    const youngMan = resolveAutomaticDemographicMinistries(
      { gender: 'Male', dateOfBirth: '1997-08-20' },
      refDate
    );
    expect(youngMan.names).toEqual([MEN_MINISTRY_LABEL, YOUTH_MINISTRY_LABEL]);

    // 45-year-old woman -> Women's Ministry only
    const adultWoman = resolveAutomaticDemographicMinistries(
      { gender: 'female', dateOfBirth: '1981-02-14' },
      refDate
    );
    expect(adultWoman.names).toEqual([WOMEN_MINISTRY_LABEL]);

    // 50-year-old man -> Men's Ministry only
    const adultMan = resolveAutomaticDemographicMinistries(
      { gender: 'male', dateOfBirth: '1976-09-05' },
      refDate
    );
    expect(adultMan.names).toEqual([MEN_MINISTRY_LABEL]);

    // Manual selection of Youth Ministry or Choir merges cleanly without duplicates
    const merged = resolveMemberAllDepartmentsAndMinistries(
      {
        gender: 'female',
        dateOfBirth: '2001-05-12',
        department: 'Choir & Music Ministry, Youth Ministry',
        departments: ['Choir & Music Ministry', 'Youth Ministry'],
      },
      refDate
    );
    expect(merged.combined).toEqual([
      'Choir & Music Ministry',
      'Youth Ministry',
      "Women's Ministry",
    ]);
  });

  it('distinguishes Women vs Men aliases strictly and expands Church Groups cleanly without duplicates', () => {
    expect(getAutomaticMinistryKind("Women's Ministry")).toBe('women');
    expect(getAutomaticMinistryKind('Women’s Fellowship')).toBe('women');
    expect(getAutomaticMinistryKind("Men's Ministry")).toBe('men');
    expect(getAutomaticMinistryKind('Men’s Fellowship')).toBe('men');
    expect(getAutomaticMinistryKind('Youth Ministry')).toBe('youth');
    expect(getAutomaticMinistryKind('Youth & Young Adults')).toBe('youth');
    expect(getAutomaticMinistryKind('Choir Ministry')).toBeNull();
    expect(getAutomaticMinistryKind('Women of Faith')).toBeNull();

    // Unconfigured groups still produce the 3 automatic demographic wings
    const defaults = mergeDemographicMinistries([]);
    expect(defaults.map((g) => g.name)).toEqual([
      WOMEN_MINISTRY_LABEL,
      MEN_MINISTRY_LABEL,
      YOUTH_MINISTRY_LABEL,
    ]);
    expect(defaults.every((g) => g.isAutoDemographicVirtual === true)).toBe(true);

    // Configured Women's Fellowship replaces virtual Women's slot without creating duplicate
    const configuredGroups: ChurchGroup[] = [
      {
        id: 'grp-women-custom',
        name: "Women's Fellowship",
        category: 'ministry',
        leaderName: 'Deaconess Comfort',
        description: 'Women fellowship',
        active: true,
        createdAt: '2026-01-01',
      },
      {
        id: 'grp-choir',
        name: 'Choir Ministry',
        category: 'ministry',
        leaderName: 'Kofi Music',
        description: 'Sanctuary Choir',
        active: true,
        createdAt: '2026-01-01',
      },
    ];

    const categories = getAllGroupCategories([], configuredGroups);
    const expanded = expandAllAutomaticChurchGroups(configuredGroups, categories);

    const womenMatches = expanded.filter((g) => getAutomaticMinistryKind(g.name) === 'women');
    expect(womenMatches).toHaveLength(1);
    expect(womenMatches[0].id).toBe('grp-women-custom');
    expect(womenMatches[0].isAutoDemographicVirtual).toBe(false);

    const menMatches = expanded.filter((g) => getAutomaticMinistryKind(g.name) === 'men');
    expect(menMatches).toHaveLength(1);
    expect(menMatches[0].isAutoDemographicVirtual).toBe(true);

    const youthMatches = expanded.filter((g) => getAutomaticMinistryKind(g.name) === 'youth');
    expect(youthMatches).toHaveLength(1);
    expect(youthMatches[0].isAutoDemographicVirtual).toBe(true);

    const youngWoman = makePerson({
      id: 'm-yw',
      firstName: 'Akua',
      gender: 'female',
      dateOfBirth: '2001-07-04',
      department: 'Choir Ministry',
    });
    expect(memberMatchesChurchGroup(youngWoman, "Women's Ministry")).toBe(true);
    expect(memberMatchesChurchGroup(youngWoman, "Women's Fellowship")).toBe(true);
    expect(memberMatchesChurchGroup(youngWoman, "Men's Ministry")).toBe(false);
    expect(memberMatchesChurchGroup(youngWoman, 'Youth Ministry')).toBe(true);

    const matchedLeads = findMatchingChurchGroup(configuredGroups, {
      department: ['Choir Ministry'],
      gender: 'female',
      dateOfBirth: '2001-07-04',
    });
    expect(matchedLeads.ministryGroups.map((g) => g.name)).toEqual([
      'Choir Ministry',
      "Women's Fellowship",
    ]);
  });

  it('rolls Women’s, Men’s, and Youth (< 35) memberships automatically into Dashboard Analytics without double counting', () => {
    const refDate = new Date(2026, 10, 15);
    const svc: ServiceInstance = {
      id: 'svc-1',
      serviceId: 'def-1',
      campusId: 'campus-1',
      name: 'Sunday Service',
      date: '2026-11-15',
      startsAt: '08:30',
      endsAt: '10:30',
      expectedAttendance: 10,
      status: 'open',
    };

    const members: Person[] = [
      // Woman age 26 + manually picked Youth Ministry -> counted ONCE in Women's & ONCE in Youth
      makePerson({
        id: 'm1',
        firstName: 'Abena',
        gender: 'female',
        dateOfBirth: '2000-01-10',
        department: 'Choir Ministry, Youth Ministry',
        departments: ['Choir Ministry', 'Youth Ministry'],
      }),
      // Woman age 44 -> Women's only
      makePerson({
        id: 'm2',
        firstName: 'Comfort',
        gender: 'female',
        dateOfBirth: '1982-05-05',
        department: 'Ushering Ministry',
      }),
      // Man age 30 -> Men's + Youth
      makePerson({
        id: 'm3',
        firstName: 'Kojo',
        gender: 'male',
        dateOfBirth: '1996-02-20',
        department: 'Media Crew',
      }),
      // Man age 48 -> Men's only
      makePerson({
        id: 'm4',
        firstName: 'Kwaku',
        gender: 'male',
        dateOfBirth: '1978-09-12',
        department: '',
      }),
    ];

    const churchGroups: ChurchGroup[] = [
      {
        id: 'grp-women',
        name: "Women's Ministry",
        category: 'ministry',
        leaderName: 'Elder Comfort',
        description: 'Women ministry',
        active: true,
        createdAt: '2026-01-01',
      },
      {
        id: 'grp-youth',
        name: 'Youth Ministry',
        category: 'ministry',
        leaderName: 'Pastor Daniel',
        description: 'Youth under 35',
        active: true,
        createdAt: '2026-01-01',
      },
    ];

    const analytics = computeDashboardAnalytics({
      members,
      attendanceRecords: [
        {
          id: 'att-1',
          tenantId: TEST_ANCHOR_ORGANIZATION_ID,
          campusId: 'campus-1',
          personId: 'm1',
          serviceInstanceId: 'svc-1',
          checkedInAt: '08:25',
          method: 'geofence',
          confidence: 99,
          late: false,
        },
        {
          id: 'att-2',
          tenantId: TEST_ANCHOR_ORGANIZATION_ID,
          campusId: 'campus-1',
          personId: 'm4',
          serviceInstanceId: 'svc-1',
          checkedInAt: '08:40',
          method: 'usher',
          confidence: 95,
          late: true,
        },
      ],
      services: [svc],
      currentService: svc,
      churchGroups,
      followupTasks: [],
      donations: [],
      systemSettings: baseSettings,
      now: refDate,
    });

    const womenRow = analytics.demographicMinistries.find((d) => d.kind === 'women');
    const menRow = analytics.demographicMinistries.find((d) => d.kind === 'men');
    const youthRow = analytics.demographicMinistries.find((d) => d.kind === 'youth');

    expect(womenRow?.totalMembers).toBe(2); // m1 & m2
    expect(womenRow?.presentCount).toBe(1); // m1
    expect(womenRow?.leaderName).toBe('Elder Comfort');

    expect(menRow?.totalMembers).toBe(2); // m3 & m4
    expect(menRow?.presentCount).toBe(1); // m4
    expect(menRow?.isConfiguredInDb).toBe(false);

    expect(youthRow?.totalMembers).toBe(2); // m1 (26) & m3 (30), m1 NOT double-counted despite manual Youth selection
    expect(youthRow?.presentCount).toBe(1); // m1
    expect(youthRow?.leaderName).toBe('Pastor Daniel');

    // Configured groups in analytics.groups & analytics.departments also reflect the full automatic counts
    const youthDept = analytics.departments.find((d) => d.name === 'Youth Ministry');
    expect(youthDept?.totalMembers).toBe(2);
    expect(youthDept?.presentCount).toBe(1);

    const womenGrp = analytics.groups.find((g) => g.name === "Women's Ministry");
    expect(womenGrp?.totalMembers).toBe(2);
    expect(womenGrp?.presentCount).toBe(1);
  });

  it('preserves explicit manual department on API create without polluting person.department', async () => {
    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Serwaa',
        lastName: 'Bonsu',
        email: 'serwaa.bonsu@ekklesphere.church',
        phoneE164: '+233244999111',
        gender: 'female',
        dateOfBirth: '2001-06-15',
        department: 'Choir & Music Ministry',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.department).toBe('Choir & Music Ministry');
    expect(resolveAutomaticDemographicMinistries(createRes.body).names).toEqual([
      WOMEN_MINISTRY_LABEL,
      YOUTH_MINISTRY_LABEL,
    ]);
  });
});
