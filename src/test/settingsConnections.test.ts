import { describe, expect, it } from 'vitest';
import { ChurchGroup, Person, SystemSettings } from '../types/ekklesphere';
import {
  findMatchingChurchGroup,
  formatFollowupDueDateLabel,
  getActiveGroupsByCategory,
  getCurrencyDisplay,
  memberMatchesChurchGroup,
  mergeSelectableCellGroups,
  mergeSelectableDepartments,
  resolveFollowupAssignee,
} from '../utils/settingsConnections';

const baseSettings: SystemSettings = {
  churchName: 'Grace Sanctuary',
  campusName: 'Main Sanctuary',
  campusAddress: '12 Faith Ave',
  campusLatitude: 6.6885,
  campusLongitude: -1.6244,
  seniorPastor: 'Rev. Daniel Boateng',
  contactEmail: 'care@gracesanctuary.org',
  contactPhone: '+233200000001',
  timezone: 'Africa/Accra',
  currency: 'GHS (Ghana Cedi)',
  outerGeofenceMeters: 250,
  innerGeofenceMeters: 60,
  dwellTimeMinutes: 5,
  serviceWindowBeforeMinutes: 45,
  serviceWindowAfterMinutes: 30,
  bleBeaconRssiThreshold: -78,
  driveByProtection: true,
  absenteeThresholdServices: 2,
  firstTimerFollowupHours: 24,
  autoAssignCellLeaders: true,
  requireExplicitConsent: true,
  auditLogRetentionDays: 365,
  smsGatewayProvider: 'Hubtel SMS',
  smsSenderId: 'GRACECHURCH',
  enablePushNotifications: true,
};

const sampleGroups: ChurchGroup[] = [
  {
    id: 'grp-choir',
    name: 'Sanctuary Choir',
    category: 'ministry',
    leaderName: 'Deaconess Ama Serwaa',
    leaderPhone: '+233240000011',
    meetingDay: 'Saturday',
    meetingTime: '16:00',
    meetingLocation: 'Choir Hall',
    description: 'Choral worship ministry',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'grp-cell',
    name: 'Bethel Home Cell',
    category: 'cell_group',
    leaderName: 'Elder Kojo Mensah',
    leaderPhone: '+233240000022',
    meetingDay: 'Wednesday',
    meetingTime: '18:30',
    meetingLocation: 'Kwadaso North',
    description: 'Midweek Bible fellowship',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'grp-youth',
    name: 'Youth Fellowship',
    category: 'fellowship',
    leaderName: 'Bro. Kofi Owusu',
    description: 'Young adults fellowship',
    active: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const sampleMembers: Person[] = [
  {
    id: 'm1',
    tenantId: 't1',
    firstName: 'Abena',
    lastName: 'Osei',
    phoneE164: '+233241111111',
    groupName: 'Bethel Home Cell',
    homeCellGroup: 'Bethel Home Cell',
    department: 'Sanctuary Choir',
    status: 'member',
    autoCheckinOptedIn: true,
    avatarInitials: 'AO',
    joinedOn: '2025-05-10',
    consecutiveAbsences: 0,
  },
  {
    id: 'm2',
    tenantId: 't1',
    firstName: 'Kwame',
    lastName: 'Appiah',
    phoneE164: '+233242222222',
    groupName: 'Media & Sound',
    homeCellGroup: '',
    department: 'Media & Sound',
    status: 'member',
    autoCheckinOptedIn: true,
    avatarInitials: 'KA',
    joinedOn: '2025-08-12',
    consecutiveAbsences: 2,
  },
];

describe('settingsConnections helpers', () => {
  it('filters active groups by category', () => {
    const grouped = getActiveGroupsByCategory(sampleGroups);
    expect(grouped.activeGroups.map((g) => g.id)).toEqual(['grp-choir', 'grp-cell']);
    expect(grouped.ministries).toHaveLength(1);
    expect(grouped.cellGroups).toHaveLength(1);
    expect(grouped.fellowships).toHaveLength(0);
  });

  it('matches members across groupName, homeCellGroup, and department', () => {
    expect(memberMatchesChurchGroup(sampleMembers[0], 'Sanctuary Choir')).toBe(true);
    expect(memberMatchesChurchGroup(sampleMembers[0], 'Bethel Home Cell')).toBe(true);
    expect(memberMatchesChurchGroup(sampleMembers[1], 'Sanctuary Choir')).toBe(false);
    expect(memberMatchesChurchGroup(sampleMembers[1], 'Media & Sound')).toBe(true);
  });

  it('resolves distinct cell/fellowship and ministry groups for a member', () => {
    const resolved = findMatchingChurchGroup(sampleGroups, {
      groupName: sampleMembers[0].groupName,
      homeCellGroup: sampleMembers[0].homeCellGroup,
      department: sampleMembers[0].department,
    });
    expect(resolved.cellOrFellowshipGroup?.id).toBe('grp-cell');
    expect(resolved.ministryGroup?.id).toBe('grp-choir');
  });

  it('merges active settings groups with member-assigned groups without duplicates', () => {
    const depts = mergeSelectableDepartments(sampleGroups, sampleMembers, ['Sanctuary Choir', 'Ushering']);
    expect(depts).toContain('General Congregation');
    expect(depts).toContain('Sanctuary Choir');
    expect(depts).toContain('Media & Sound');
    expect(depts).toContain('Ushering');
    expect(depts.filter((d) => d.toLowerCase() === 'sanctuary choir')).toHaveLength(1);

    const cells = mergeSelectableCellGroups(sampleGroups, sampleMembers);
    expect(cells).toContain('Bethel Home Cell');
    expect(cells).toContain('Media & Sound');
    expect(cells.filter((c) => c.toLowerCase() === 'bethel home cell')).toHaveLength(1);
  });

  it('routes follow-up assignees using autoAssignCellLeaders and seniorPastor settings', () => {
    const assignedCellLeader = resolveFollowupAssignee(
      sampleMembers[0],
      sampleGroups,
      baseSettings,
      'absent_2'
    );
    expect(assignedCellLeader.assignedToName).toBe('Elder Kojo Mensah');
    expect(assignedCellLeader.groupName).toBe('Bethel Home Cell');

    const escalated = resolveFollowupAssignee(
      sampleMembers[0],
      sampleGroups,
      baseSettings,
      'absent_3'
    );
    expect(escalated.assignedToName).toBe('Rev. Daniel Boateng');

    const manualMode = resolveFollowupAssignee(
      sampleMembers[0],
      sampleGroups,
      { ...baseSettings, autoAssignCellLeaders: false },
      'first_timer'
    );
    expect(manualMode.assignedToName).toBe('Rev. Daniel Boateng');
  });

  it('formats follow-up due labels using pastoral SLA settings', () => {
    expect(formatFollowupDueDateLabel('first_timer', 24, 2)).toBe('Within 24h');
    expect(formatFollowupDueDateLabel('first_timer', 48, 2)).toBe('Within 2 days (48h)');
    expect(formatFollowupDueDateLabel('absent_2', 24, 3)).toBe('Within 72h (3w trigger)');
    expect(formatFollowupDueDateLabel('absent_3', 24, 3)).toBe('Urgent (4w escalation)');
  });

  it('resolves currency display codes and preset giving amounts', () => {
    expect(getCurrencyDisplay('GHS (Ghana Cedi)').code).toBe('GHS');
    expect(getCurrencyDisplay('USD ($ Dollar)').symbol).toBe('$');
    expect(getCurrencyDisplay('USD ($ Dollar)').presetAmounts).toEqual([10, 25, 50, 100]);
    expect(getCurrencyDisplay('GBP (£ Pound)').code).toBe('GBP');
    expect(getCurrencyDisplay('NGN (₦ Naira)').presetAmounts[0]).toBe(1000);
  });
});
