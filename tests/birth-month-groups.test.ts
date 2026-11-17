import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../server';
import { signToken, TEST_ANCHOR_ORGANIZATION_ID } from '../lib/auth';
import { platformStore } from '../src/server/platformStore';
import {
  ALL_BIRTH_MONTH_GROUPS,
  deriveMonthOfBirth,
  formatBirthMonthGroupName,
  isBirthMonthGroupName,
  resolveMemberBirthFields,
} from '../src/utils/birthMonth';
import {
  expandGroupsWithMonthBorn,
  getAllGroupCategories,
  isMonthBornCategory,
  mergeTwelveMonthBornGroups,
} from '../src/shared/groupCategories';
import { memberMatchesChurchGroup } from '../src/utils/settingsConnections';
import { computeDashboardAnalytics } from '../src/utils/dashboardAnalytics';
import { validateMemberImportBatch } from '../src/shared/memberImportValidation';
import { ChurchGroup, Person } from '../src/types/ekklesphere';

describe('Birth Month & Automatic Birth Month Group Assignment', () => {
  const adminToken = signToken({
    id: 'user-bm-admin',
    email: 'bm-admin@ekklesphere.church',
    role: 'admin',
    name: 'Birth Month Admin',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  const memberToken = signToken({
    id: 'user-bm-member',
    email: 'ama.mensah@ekklesphere.church',
    role: 'member',
    name: 'Ama Mensah',
    organization_id: TEST_ANCHOR_ORGANIZATION_ID,
  });

  beforeEach(() => {
    platformStore.resetForTests();
  });

  it('derives month of birth strictly from date of birth and formats canonical groups', () => {
    expect(deriveMonthOfBirth('1994-05-19')).toBe('May');
    expect(deriveMonthOfBirth('19/05/1994')).toBe('May');
    expect(deriveMonthOfBirth('1994-05-19', 'December')).toBe('May');
    expect(deriveMonthOfBirth('', 'aug')).toBe('August');

    expect(formatBirthMonthGroupName('May')).toBe('May Birthday Group');
    expect(formatBirthMonthGroupName('november')).toBe('November Birthday Group');
    expect(ALL_BIRTH_MONTH_GROUPS).toHaveLength(12);

    // Date of birth overrides any conflicting month/group
    expect(
      resolveMemberBirthFields({
        dateOfBirth: '1991-09-12',
        monthOfBirth: 'March',
        birthMonthGroup: 'March Birthday Group',
      })
    ).toEqual({
      monthOfBirth: 'September',
      birthMonthGroup: 'September Birthday Group',
    });

    // Month-only fallback still assigns canonical birth month group
    expect(
      resolveMemberBirthFields({
        dateOfBirth: '',
        monthOfBirth: 'July',
      })
    ).toEqual({
      monthOfBirth: 'July',
      birthMonthGroup: 'July Birthday Group',
    });
  });

  it('assigns synced month of birth & birthMonthGroup on CSV import and warns on DOB conflict', () => {
    const { rows, summary } = validateMemberImportBatch(
      [
        {
          'FIRST NAME': 'Kofi',
          'LAST NAME': 'Owusu',
          'PHONE NUMBER': '0244555111',
          'DATE OF BIRTH': '1992-03-14',
          'MONTH OF BIRTH': 'October',
        },
        {
          'FIRST NAME': 'Abena',
          'LAST NAME': 'Asare',
          'PHONE NUMBER': '0244555222',
          'MONTH OF BIRTH': 'dec',
        },
      ],
      [],
      'skip'
    );

    expect(summary.valid).toBe(2);
    expect(rows[0].data.monthOfBirth).toBe('March');
    expect(rows[0].data.birthMonthGroup).toBe('March Birthday Group');
    expect(rows[0].warnings.some((w) => w.includes('synced to March'))).toBe(true);

    expect(rows[1].data.monthOfBirth).toBe('December');
    expect(rows[1].data.birthMonthGroup).toBe('December Birthday Group');
  });

  it('persists synced monthOfBirth & automatic birthMonthGroup via admin & member APIs', async () => {
    // 1. Admin creates member with DOB; even if stale month sent, DOB wins
    const createRes = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Ama',
        lastName: 'Mensah',
        email: 'ama.mensah@ekklesphere.church',
        phoneE164: '+233244333444',
        dateOfBirth: '1995-04-08',
        monthOfBirth: 'January',
        homeCellGroup: 'Cantonments Cell',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.monthOfBirth).toBe('April');
    expect(createRes.body.birthMonthGroup).toBe('April Birthday Group');

    // 2. Admin edits DOB and verifies automatic birth month group re-syncs
    const updateRes = await request(app)
      .put(`/api/members/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        dateOfBirth: '1995-11-21',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.monthOfBirth).toBe('November');
    expect(updateRes.body.birthMonthGroup).toBe('November Birthday Group');

    // 3. Member updates own DOB via self-service profile endpoint and gets synced group back
    const selfRes = await request(app)
      .patch('/api/members/me/profile')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        dateOfBirth: '1995-07-02',
      });

    expect(selfRes.status).toBe(200);
    expect(selfRes.body.profile?.monthOfBirth ?? selfRes.body.monthOfBirth).toBe('July');
    expect(selfRes.body.profile?.birthMonthGroup ?? selfRes.body.birthMonthGroup).toBe(
      'July Birthday Group'
    );
  });

  it('always provides all 12 Month Born Groups when Month Born category exists and merges custom leads without duplicates', () => {
    expect(isMonthBornCategory('month_born')).toBe(true);
    expect(isMonthBornCategory('birth_month')).toBe(true);
    expect(isMonthBornCategory('cell_group')).toBe(false);
    expect(isMonthBornCategory('department')).toBe(false);

    expect(isBirthMonthGroupName('May Birthday Group')).toBe(true);
    expect(isBirthMonthGroupName('January Born')).toBe(true);
    expect(isBirthMonthGroupName('Mayflower Cell')).toBe(false);

    // 0 configured month_born DB groups -> still returns all 12 automatic month groups
    const allTwelveDefault = mergeTwelveMonthBornGroups([], 'month_born');
    expect(allTwelveDefault).toHaveLength(12);
    expect(allTwelveDefault[0].name).toBe('January Birthday Group');
    expect(allTwelveDefault[11].name).toBe('December Birthday Group');
    expect(allTwelveDefault.every((g) => g.isAutoBirthMonthVirtual === true && g.category === 'month_born')).toBe(true);

    // Configured groups for January & May replace their slots while preserving total = 12
    const configuredGroups: ChurchGroup[] = [
      {
        id: 'grp-cell-1',
        name: 'Mayflower Cell',
        category: 'cell_group',
        leaderName: 'Elder Kojo',
        description: 'Community cell',
        active: true,
        createdAt: '2026-01-01',
      },
      {
        id: 'grp-jan-custom',
        name: 'January Born',
        category: 'month_born',
        leaderName: 'Esi Badu',
        meetingDay: '1st Saturday',
        description: 'January leadership group',
        active: true,
        createdAt: '2026-01-01',
      },
      {
        id: 'grp-may-custom',
        name: 'May Birthday Group',
        category: 'month_born',
        leaderName: 'Kwame Boateng',
        description: 'May fellowship',
        active: true,
        createdAt: '2026-01-01',
      },
    ];

    const categories = getAllGroupCategories(
      [
        {
          id: 'month_born',
          label: 'Month Born',
          pluralLabel: 'Month Born Groups',
          description: 'Birth Month Fellowship',
          color: 'amber',
          isBuiltIn: false,
        },
      ],
      configuredGroups
    );

    const expanded = expandGroupsWithMonthBorn(configuredGroups, categories);
    const monthBornOnly = expanded.filter((g) => isMonthBornCategory(g.category));
    expect(monthBornOnly).toHaveLength(12);
    expect(expanded).toHaveLength(13); // 1 cell_group + 12 month_born groups

    const janSlot = monthBornOnly.find((g) => g.birthMonthName === 'January');
    expect(janSlot?.id).toBe('grp-jan-custom');
    expect(janSlot?.leaderName).toBe('Esi Badu');
    expect(janSlot?.isAutoBirthMonthVirtual).toBe(false);

    const maySlot = monthBornOnly.find((g) => g.birthMonthName === 'May');
    expect(maySlot?.id).toBe('grp-may-custom');
    expect(maySlot?.leaderName).toBe('Kwame Boateng');
    expect(maySlot?.isAutoBirthMonthVirtual).toBe(false);

    const febSlot = monthBornOnly.find((g) => g.birthMonthName === 'February');
    expect(febSlot?.name).toBe('February Birthday Group');
    expect(febSlot?.isAutoBirthMonthVirtual).toBe(true);
  });

  it('matches birthdate-assigned members to Month Born Groups without false-matching cell groups', () => {
    const memberMay: Person = {
      id: 'm-may',
      tenantId: TEST_ANCHOR_ORGANIZATION_ID,
      memberId: 'MEM-1001',
      firstName: 'Akosua',
      lastName: 'Mensah',
      avatarInitials: 'AM',
      phoneE164: '+233241001001',
      status: 'member',
      groupName: 'Cantonments Cell',
      dateOfBirth: '1993-05-14',
      joinedOn: '2026-01-01',
      autoCheckinOptedIn: true,
      consecutiveAbsences: 0,
    };
    const memberJan: Person = {
      id: 'm-jan',
      tenantId: TEST_ANCHOR_ORGANIZATION_ID,
      memberId: 'MEM-1002',
      firstName: 'Yaw',
      lastName: 'Frimpong',
      avatarInitials: 'YF',
      phoneE164: '+233241001002',
      status: 'member',
      groupName: 'Cantonments Cell',
      dateOfBirth: '1990-01-22',
      joinedOn: '2026-01-01',
      autoCheckinOptedIn: true,
      consecutiveAbsences: 0,
    };

    expect(memberMatchesChurchGroup(memberMay, 'May Birthday Group')).toBe(true);
    expect(memberMatchesChurchGroup(memberMay, 'Mayflower Cell')).toBe(false);
    expect(memberMatchesChurchGroup(memberJan, 'January Birthday Group')).toBe(true);
    expect(memberMatchesChurchGroup(memberJan, 'January Born')).toBe(true);

    const analytics = computeDashboardAnalytics({
      members: [memberMay, memberJan],
      attendanceRecords: [],
      services: [],
      currentService: {
        id: 'svc-bm',
        serviceId: 'svc-bm',
        campusId: 'site-1',
        name: 'Sunday Service',
        date: '2026-11-15',
        startsAt: '08:30',
        endsAt: '11:00',
        status: 'closed',
        expectedAttendance: 50,
      },
      churchGroups: [
        {
          id: 'grp-may',
          name: 'May Birthday Group',
          category: 'month_born',
          leaderName: 'Akosua Mensah',
          description: 'May group',
          active: true,
          createdAt: '2026-01-01',
        },
      ],
      followupTasks: [],
      donations: [],
      systemSettings: {
        absenteeThresholdServices: 2,
      } as any,
    });

    const mayRow = analytics.groups.find((g) => g.name === 'May Birthday Group');
    expect(mayRow?.totalMembers).toBe(1);
    expect(analytics.birthMonthGroups).toHaveLength(12);
  });
});
