// src/utils/dashboardAnalytics.ts
// Pure, O(N) memoizable analytics engine for the Ekklesphere Admin Dashboard.
// Aggregates active service telemetry, department turnout, ministries/fellowships/cell groups,
// congregation demographics, record completeness, and multi-service comparisons.

import {
  AttendanceRecord,
  CheckinMethod,
  ChurchGroup,
  ChurchGroupCategory,
  Donation,
  FollowupTask,
  Person,
  ServiceInstance,
  SystemSettings,
} from '../types/ekklesphere';
import { computeServiceBinaryStatus, BinaryServiceStatus } from './serviceStatus';
import {
  findMatchingChurchGroup,
  isAssignedLeaderName,
} from './settingsConnections';

export interface DepartmentAnalyticRow {
  name: string;
  groupId?: string;
  isConfiguredInDb: boolean;
  leaderName: string | null;
  assistantLeader?: string;
  leaderPhone?: string;
  leaderEmail?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  active: boolean;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  turnoutPct: number;
  autoCheckinCount: number;
  autoCheckinPct: number;
  atRiskCount: number;
  openFollowupCount: number;
  shareOfRosterPct: number;
}

export interface GroupAnalyticRow {
  id: string;
  name: string;
  category: ChurchGroupCategory;
  leaderName: string;
  assistantLeader?: string;
  leaderPhone?: string;
  leaderEmail?: string;
  meetingDay?: string;
  meetingTime?: string;
  meetingLocation?: string;
  targetDemographic?: string;
  description?: string;
  active: boolean;
  isConfiguredInDb: boolean;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  turnoutPct: number;
  autoCheckinCount: number;
  autoCheckinPct: number;
  atRiskCount: number;
  openFollowupCount: number;
}

export interface LeaderAnalyticGroupRef {
  id: string;
  name: string;
  category: ChurchGroupCategory;
  role: 'Lead' | 'Co-Lead';
  active: boolean;
}

export interface LeaderAnalyticRow {
  id: string;
  leaderName: string;
  phone?: string;
  email?: string;
  rolesCount: number;
  leadCount: number;
  coLeadCount: number;
  groups: LeaderAnalyticGroupRef[];
  totalMembersSupervised: number;
  presentCount: number;
  turnoutPct: number;
  atRiskCount: number;
  openFollowupCount: number;
}

export interface LeadershipAnalyticsSummary {
  configuredGroupsCount: number;
  activeGroupsCount: number;
  assignedPrimaryLeadersCount: number;
  coLedGroupsCount: number;
  distinctLeadersCount: number;
  groupsMissingLeaderCount: number;
  unconfiguredGroupsCount: number;
  unconfiguredDepartmentsCount: number;
  membersUnderConfiguredLeadershipCount: number;
  leadershipCoveragePct: number;
  leaders: LeaderAnalyticRow[];
}

export interface ChannelBreakdownItem {
  method: CheckinMethod;
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface DistributionItem {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface ServiceComparisonRow {
  id: string;
  name: string;
  date?: string;
  startsAt: string;
  endsAt: string;
  startTimeIso?: string;
  endTimeIso?: string;
  dwellMinutes: number;
  status: ServiceInstance['status'];
  binaryStatus: BinaryServiceStatus;
  isActive: boolean;
  checkedInCount: number;
  expectedAttendance: number;
  fillRatePct: number;
  onTimePct: number;
  autoPct: number;
}

export interface DashboardAnalyticsResult {
  activeService: {
    id: string;
    name: string;
    date?: string;
    startsAt: string;
    endsAt: string;
    dwellMinutes: number;
    status: ServiceInstance['status'];
    binaryStatus: BinaryServiceStatus;
    attendanceCount: number;
    expectedAttendance: number;
    turnoutPct: number;
    absenteeCount: number;
    absenteePct: number;
    onTimeCount: number;
    lateCount: number;
    punctualityPct: number;
    autoCount: number;
    assistedCount: number;
    atRiskCount: number;
    channels: ChannelBreakdownItem[];
    checkedInPersonIds: Set<string>;
  };
  membership: {
    totalMembers: number;
    activeStatusCount: number;
    visitorsCount: number;
    inactiveCount: number;
    autoCheckinCount: number;
    autoCheckinPct: number;
    manualCheckinCount: number;
    manualCheckinPct: number;
    openFollowupCount: number;
    birthdaysThisMonthCount: number;
    genderBreakdown: DistributionItem[];
    maritalBreakdown: DistributionItem[];
    completeness: {
      phonePct: number;
      emailPct: number;
      photoPct: number;
      digitalAddressPct: number;
      birthdayPct: number;
      phoneCount: number;
      emailCount: number;
      photoCount: number;
      digitalAddressCount: number;
      birthdayCount: number;
    };
  };
  departments: DepartmentAnalyticRow[];
  namedDepartmentsCount: number;
  topDepartment: DepartmentAnalyticRow | null;
  groups: GroupAnalyticRow[];
  groupCounts: {
    total: number;
    active: number;
    ministries: number;
    fellowships: number;
    cellGroups: number;
  };
  leadership: LeadershipAnalyticsSummary;
  serviceComparisons: ServiceComparisonRow[];
  giving: {
    totalPaidGhs: number;
    donationsCount: number;
    topFundName: string | null;
  };
}

export interface ComputeDashboardAnalyticsInput {
  members: Person[];
  attendanceRecords: AttendanceRecord[];
  services: ServiceInstance[];
  currentService: ServiceInstance;
  churchGroups: ChurchGroup[];
  followupTasks: FollowupTask[];
  donations?: Donation[];
  systemSettings: SystemSettings;
  now?: Date;
}

const CHANNEL_META: Record<CheckinMethod, { label: string; color: string }> = {
  geofence: { label: 'Auto Geofence', color: '#4FBF98' },
  beacon: { label: 'BLE Beacon', color: '#59C3C3' },
  usher: { label: 'Usher Door', color: '#6D5CF2' },
  posted_qr: { label: 'QR Code Scan', color: '#8C7DFF' },
  manual: { label: 'Manual Desk', color: '#F59E0B' },
  email_link: { label: 'Email Link', color: '#64748B' },
};

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function normalizeLabel(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCanonicalKey(raw?: string | null): string {
  return normalizeLabel(raw).toLowerCase();
}

export function computeDashboardAnalytics(
  input: ComputeDashboardAnalyticsInput
): DashboardAnalyticsResult {
  const {
    members,
    attendanceRecords,
    services,
    currentService,
    churchGroups,
    followupTasks,
    donations = [],
    systemSettings,
    now = new Date(),
  } = input;

  const threshold = Math.max(1, systemSettings.absenteeThresholdServices || 2);

  // 1. Scope attendance records for the active service/event
  const scopedAttendance = attendanceRecords.filter(
    (r) =>
      r.serviceInstanceId === currentService.id ||
      (!r.serviceInstanceId && services.length <= 1)
  );
  const checkedInPersonIds = new Set<string>(scopedAttendance.map((r) => r.personId));

  const attendanceCount = scopedAttendance.length;
  const expectedAttendance = Math.max(
    currentService.expectedAttendance || 0,
    members.length > 0 ? members.length : 0
  );
  const turnoutPct = expectedAttendance > 0 ? pct(attendanceCount, expectedAttendance) : 0;

  const checkedInMembersCount = members.filter((m) => checkedInPersonIds.has(m.id)).length;
  const absenteeBaseline = members.length > 0 ? members.length : expectedAttendance;
  const absenteeCount =
    members.length > 0
      ? Math.max(0, members.length - checkedInMembersCount)
      : Math.max(0, expectedAttendance - attendanceCount);
  const absenteePct = absenteeBaseline > 0 ? pct(absenteeCount, absenteeBaseline) : 0;

  const lateCount = scopedAttendance.filter((r) => r.late).length;
  const onTimeCount = Math.max(0, attendanceCount - lateCount);
  const punctualityPct = attendanceCount > 0 ? pct(onTimeCount, attendanceCount) : 0;

  const autoCount = scopedAttendance.filter(
    (r) => r.method === 'geofence' || r.method === 'beacon'
  ).length;
  const assistedCount = Math.max(0, attendanceCount - autoCount);

  const atRiskCount = members.filter(
    (m) => !checkedInPersonIds.has(m.id) && (m.consecutiveAbsences || 0) >= threshold
  ).length;

  // Channel mix
  const channelCounts = new Map<CheckinMethod, number>();
  for (const record of scopedAttendance) {
    channelCounts.set(record.method, (channelCounts.get(record.method) || 0) + 1);
  }
  const channels: ChannelBreakdownItem[] = (Object.keys(CHANNEL_META) as CheckinMethod[])
    .map((method) => {
      const count = channelCounts.get(method) || 0;
      return {
        method,
        label: CHANNEL_META[method].label,
        count,
        pct: pct(count, attendanceCount),
        color: CHANNEL_META[method].color,
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // 2. Membership demographics & directory completeness (single pass)
  const totalMembers = members.length;
  let activeStatusCount = 0;
  let visitorsCount = 0;
  let inactiveCount = 0;
  let autoCheckinCount = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let otherGenderCount = 0;
  let marriedCount = 0;
  let singleCount = 0;
  let widowedDivorcedCount = 0;
  let unspecifiedMaritalCount = 0;
  let phoneCount = 0;
  let emailCount = 0;
  let photoCount = 0;
  let digitalAddressCount = 0;
  let birthdayCount = 0;
  let birthdaysThisMonthCount = 0;

  const currentMonthIndex = now.getMonth(); // 0..11
  const currentMonthLong = now.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  const currentMonthShort = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();

  // Open follow-up lookup by person & group for department/group/leader accountability
  const openTasks = followupTasks.filter((t) => t.status === 'open');
  const openTaskIdsByPersonId = new Map<string, string[]>();
  for (const task of openTasks) {
    if (!task.personId) continue;
    const list = openTaskIdsByPersonId.get(task.personId) || [];
    list.push(task.id);
    openTaskIdsByPersonId.set(task.personId, list);
  }

  // Department aggregation bucket map
  const deptMap = new Map<
    string,
    {
      displayName: string;
      totalMembers: number;
      presentCount: number;
      autoCheckinCount: number;
      atRiskCount: number;
      openTaskIds: Set<string>;
    }
  >();

  const ensureDept = (rawDept: string) => {
    const clean = normalizeLabel(rawDept) || 'General Congregation';
    const key = clean.toLowerCase();
    let bucket = deptMap.get(key);
    if (!bucket) {
      bucket = {
        displayName: clean,
        totalMembers: 0,
        presentCount: 0,
        autoCheckinCount: 0,
        atRiskCount: 0,
        openTaskIds: new Set<string>(),
      };
      deptMap.set(key, bucket);
    }
    return bucket;
  };

  // Pre-seed ministry/department groups if churchGroups explicitly defines active ministries
  const configuredMinistryKeys = new Set<string>();
  for (const grp of churchGroups) {
    if (grp.category === 'ministry' && grp.active !== false && grp.name.trim()) {
      ensureDept(grp.name);
      configuredMinistryKeys.add(getCanonicalKey(grp.name));
    }
  }

  for (const m of members) {
    const isPresent = checkedInPersonIds.has(m.id);
    const isAtRisk = !isPresent && (m.consecutiveAbsences || 0) >= threshold;

    if (m.status === 'visitor') visitorsCount++;
    else if (m.status === 'inactive' || m.status === 'transferred' || m.status === 'deceased')
      inactiveCount++;
    else activeStatusCount++;

    if (m.autoCheckinOptedIn) autoCheckinCount++;

    const g = String(m.gender || '').trim().toLowerCase();
    if (g === 'male' || g === 'm') maleCount++;
    else if (g === 'female' || g === 'f') femaleCount++;
    else otherGenderCount++;

    const ms = String(m.maritalStatus || '').trim().toLowerCase();
    if (ms === 'married') marriedCount++;
    else if (ms === 'single') singleCount++;
    else if (ms === 'widowed' || ms === 'divorced') widowedDivorcedCount++;
    else unspecifiedMaritalCount++;

    if (normalizeLabel(m.phoneE164 || m.phoneNumber)) phoneCount++;
    if (normalizeLabel(m.email)) emailCount++;
    if (normalizeLabel(m.imageUrl)) photoCount++;
    if (normalizeLabel(m.residentialDigitalAddress)) digitalAddressCount++;

    const dob = normalizeLabel(m.dateOfBirth);
    const mob = normalizeLabel(m.monthOfBirth).toLowerCase();
    if (dob || mob) {
      birthdayCount++;
      let isSameMonth = false;
      if (dob && /^\d{4}-\d{2}-\d{2}/.test(dob)) {
        const monthPart = Number(dob.slice(5, 7));
        if (monthPart - 1 === currentMonthIndex) isSameMonth = true;
      } else if (mob && (mob.startsWith(currentMonthShort) || mob === currentMonthLong)) {
        isSameMonth = true;
      }
      if (isSameMonth) birthdaysThisMonthCount++;
    }

    const deptLabel = normalizeLabel(m.department) || 'General Congregation';
    const deptBucket = ensureDept(deptLabel);
    deptBucket.totalMembers++;
    if (isPresent) deptBucket.presentCount++;
    if (m.autoCheckinOptedIn) deptBucket.autoCheckinCount++;
    if (isAtRisk) deptBucket.atRiskCount++;
    const memberOpenTaskIds = openTaskIdsByPersonId.get(m.id);
    if (memberOpenTaskIds) {
      for (const tId of memberOpenTaskIds) deptBucket.openTaskIds.add(tId);
    }
  }

  const departments: DepartmentAnalyticRow[] = Array.from(deptMap.values())
    .filter(
      (d) =>
        d.totalMembers > 0 ||
        configuredMinistryKeys.has(getCanonicalKey(d.displayName)) ||
        deptMap.size <= 12
    )
    .map((d) => {
      const { ministryGroup } = findMatchingChurchGroup(churchGroups, {
        department: d.displayName,
      });
      const matchedLeader =
        ministryGroup && isAssignedLeaderName(ministryGroup.leaderName)
          ? normalizeLabel(ministryGroup.leaderName)
          : null;
      return {
        name: d.displayName,
        groupId: ministryGroup?.id,
        isConfiguredInDb: Boolean(ministryGroup),
        leaderName: matchedLeader,
        assistantLeader: normalizeLabel(ministryGroup?.assistantLeader) || undefined,
        leaderPhone: normalizeLabel(ministryGroup?.leaderPhone) || undefined,
        leaderEmail: normalizeLabel(ministryGroup?.leaderEmail) || undefined,
        meetingDay: normalizeLabel(ministryGroup?.meetingDay) || undefined,
        meetingTime: normalizeLabel(ministryGroup?.meetingTime) || undefined,
        meetingLocation: normalizeLabel(ministryGroup?.meetingLocation) || undefined,
        active: ministryGroup ? ministryGroup.active !== false : true,
        totalMembers: d.totalMembers,
        presentCount: d.presentCount,
        absentCount: Math.max(0, d.totalMembers - d.presentCount),
        turnoutPct: pct(d.presentCount, d.totalMembers),
        autoCheckinCount: d.autoCheckinCount,
        autoCheckinPct: pct(d.autoCheckinCount, d.totalMembers),
        atRiskCount: d.atRiskCount,
        openFollowupCount: d.openTaskIds.size,
        shareOfRosterPct: pct(d.totalMembers, totalMembers),
      };
    })
    .sort((a, b) => b.totalMembers - a.totalMembers || b.turnoutPct - a.turnoutPct || a.name.localeCompare(b.name));

  const namedDepartments = departments.filter(
    (d) =>
      d.totalMembers > 0 &&
      d.name.toLowerCase() !== 'general' &&
      d.name.toLowerCase() !== 'general congregation'
  );
  const namedDepartmentsCount =
    namedDepartments.length > 0
      ? namedDepartments.length
      : departments.filter((d) => d.totalMembers > 0).length;
  const topDepartment = namedDepartments[0] || departments[0] || null;

  // 3. Ministries, Fellowships & Cell Groups Analytics
  const groupRegistry = new Map<string, GroupAnalyticRow>();

  for (const grp of churchGroups) {
    const cleanName = normalizeLabel(grp.name);
    if (!cleanName) continue;
    const key = getCanonicalKey(cleanName);
    groupRegistry.set(key, {
      id: grp.id,
      name: cleanName,
      category: grp.category,
      leaderName: normalizeLabel(grp.leaderName) || 'Unassigned',
      assistantLeader: normalizeLabel(grp.assistantLeader) || undefined,
      leaderPhone: normalizeLabel(grp.leaderPhone) || undefined,
      leaderEmail: normalizeLabel(grp.leaderEmail) || undefined,
      meetingDay: normalizeLabel(grp.meetingDay) || undefined,
      meetingTime: normalizeLabel(grp.meetingTime) || undefined,
      meetingLocation: normalizeLabel(grp.meetingLocation) || undefined,
      targetDemographic: normalizeLabel(grp.targetDemographic) || undefined,
      description: normalizeLabel(grp.description) || undefined,
      active: grp.active,
      isConfiguredInDb: true,
      totalMembers: 0,
      presentCount: 0,
      absentCount: 0,
      turnoutPct: 0,
      autoCheckinCount: 0,
      autoCheckinPct: 0,
      atRiskCount: 0,
      openFollowupCount: 0,
    });
  }

  // Track membership against every group (avoiding double-counting a member inside the same group)
  const groupMemberIds = new Map<string, Set<string>>();
  const groupOpenTaskIds = new Map<string, Set<string>>();
  for (const key of groupRegistry.keys()) {
    groupMemberIds.set(key, new Set<string>());
    groupOpenTaskIds.set(key, new Set<string>());
  }

  const addMemberToGroup = (
    rawGroupName: string | undefined | null,
    member: Person,
    fallbackCategory: ChurchGroupCategory
  ) => {
    const cleanName = normalizeLabel(rawGroupName);
    if (!cleanName) return;
    const key = getCanonicalKey(cleanName);
    if (!groupRegistry.has(key)) {
      groupRegistry.set(key, {
        id: `discovered-${key}`,
        name: cleanName,
        category: fallbackCategory,
        leaderName: 'Directory Group',
        active: true,
        isConfiguredInDb: false,
        totalMembers: 0,
        presentCount: 0,
        absentCount: 0,
        turnoutPct: 0,
        autoCheckinCount: 0,
        autoCheckinPct: 0,
        atRiskCount: 0,
        openFollowupCount: 0,
      });
      groupMemberIds.set(key, new Set<string>());
      groupOpenTaskIds.set(key, new Set<string>());
    }
    const idSet = groupMemberIds.get(key)!;
    if (idSet.has(member.id)) return;
    idSet.add(member.id);

    const row = groupRegistry.get(key)!;
    const isPresent = checkedInPersonIds.has(member.id);
    const isAtRisk = !isPresent && (member.consecutiveAbsences || 0) >= threshold;
    row.totalMembers++;
    if (isPresent) row.presentCount++;
    if (member.autoCheckinOptedIn) row.autoCheckinCount++;
    if (isAtRisk) row.atRiskCount++;

    const taskSet = groupOpenTaskIds.get(key)!;
    const memberTasks = openTaskIdsByPersonId.get(member.id);
    if (memberTasks) {
      for (const tId of memberTasks) taskSet.add(tId);
    }
  };

  for (const m of members) {
    addMemberToGroup(m.homeCellGroup || m.groupName, m, 'cell_group');
    if (m.groupName && getCanonicalKey(m.groupName) !== getCanonicalKey(m.homeCellGroup)) {
      addMemberToGroup(m.groupName, m, 'cell_group');
    }
    if (
      m.department &&
      normalizeLabel(m.department).toLowerCase() !== 'general' &&
      normalizeLabel(m.department).toLowerCase() !== 'general congregation'
    ) {
      addMemberToGroup(m.department, m, 'ministry');
    }
  }

  // Also include open tasks explicitly tagged to a group's name (if person wasn't matched directly)
  for (const task of openTasks) {
    const taskGroupKey = getCanonicalKey(task.groupName);
    if (taskGroupKey && groupOpenTaskIds.has(taskGroupKey)) {
      groupOpenTaskIds.get(taskGroupKey)!.add(task.id);
    }
  }

  const groups: GroupAnalyticRow[] = Array.from(groupRegistry.entries())
    .map(([key, g]) => ({
      ...g,
      absentCount: Math.max(0, g.totalMembers - g.presentCount),
      turnoutPct: pct(g.presentCount, g.totalMembers),
      autoCheckinPct: pct(g.autoCheckinCount, g.totalMembers),
      openFollowupCount: groupOpenTaskIds.get(key)?.size || 0,
    }))
    .sort((a, b) => b.totalMembers - a.totalMembers || b.turnoutPct - a.turnoutPct || a.name.localeCompare(b.name));

  const groupCounts = {
    total: groups.length,
    active: groups.filter((g) => g.active).length,
    ministries: groups.filter((g) => g.category === 'ministry').length,
    fellowships: groups.filter((g) => g.category === 'fellowship').length,
    cellGroups: groups.filter((g) => g.category === 'cell_group').length,
  };

  // 3b. Congregational Structure & Leadership Accountability Rollup
  const leaderBuckets = new Map<
    string,
    {
      displayName: string;
      phone?: string;
      email?: string;
      groups: LeaderAnalyticGroupRef[];
      memberIds: Set<string>;
      openTaskIds: Set<string>;
    }
  >();

  const registerLeaderRole = (
    rawName: string | undefined | null,
    role: 'Lead' | 'Co-Lead',
    grp: ChurchGroup,
    phone?: string,
    email?: string
  ) => {
    if (!isAssignedLeaderName(rawName)) return;
    const cleanName = normalizeLabel(rawName);
    const key = cleanName.toLowerCase();
    let bucket = leaderBuckets.get(key);
    if (!bucket) {
      bucket = {
        displayName: cleanName,
        phone: normalizeLabel(phone) || undefined,
        email: normalizeLabel(email) || undefined,
        groups: [],
        memberIds: new Set<string>(),
        openTaskIds: new Set<string>(),
      };
      leaderBuckets.set(key, bucket);
    } else {
      if (!bucket.phone && phone) bucket.phone = normalizeLabel(phone) || undefined;
      if (!bucket.email && email) bucket.email = normalizeLabel(email) || undefined;
    }

    const alreadyHasGroup = bucket.groups.some((g) => g.id === grp.id && g.role === role);
    if (!alreadyHasGroup) {
      bucket.groups.push({
        id: grp.id,
        name: normalizeLabel(grp.name),
        category: grp.category,
        role,
        active: grp.active !== false,
      });
    }

    const groupKey = getCanonicalKey(grp.name);
    const memberSet = groupMemberIds.get(groupKey);
    if (memberSet) {
      for (const mId of memberSet) bucket.memberIds.add(mId);
    }
    const taskSet = groupOpenTaskIds.get(groupKey);
    if (taskSet) {
      for (const tId of taskSet) bucket.openTaskIds.add(tId);
    }
  };

  for (const grp of churchGroups) {
    if (!normalizeLabel(grp.name)) continue;
    registerLeaderRole(grp.leaderName, 'Lead', grp, grp.leaderPhone, grp.leaderEmail);
    registerLeaderRole(grp.assistantLeader, 'Co-Lead', grp);
  }

  const memberById = new Map<string, Person>(members.map((m) => [m.id, m]));
  const leaders: LeaderAnalyticRow[] = Array.from(leaderBuckets.entries())
    .map(([key, bucket]) => {
      let presentCount = 0;
      let atRiskCount = 0;
      for (const mId of bucket.memberIds) {
        if (checkedInPersonIds.has(mId)) {
          presentCount++;
        } else {
          const person = memberById.get(mId);
          if (person && (person.consecutiveAbsences || 0) >= threshold) {
            atRiskCount++;
          }
        }
      }
      const totalSupervised = bucket.memberIds.size;
      const leadCount = bucket.groups.filter((g) => g.role === 'Lead').length;
      const coLeadCount = bucket.groups.filter((g) => g.role === 'Co-Lead').length;
      return {
        id: `leader-${key}`,
        leaderName: bucket.displayName,
        phone: bucket.phone,
        email: bucket.email,
        rolesCount: bucket.groups.length,
        leadCount,
        coLeadCount,
        groups: bucket.groups,
        totalMembersSupervised: totalSupervised,
        presentCount,
        turnoutPct: pct(presentCount, totalSupervised),
        atRiskCount,
        openFollowupCount: bucket.openTaskIds.size,
      };
    })
    .sort(
      (a, b) =>
        b.totalMembersSupervised - a.totalMembersSupervised ||
        b.presentCount - a.presentCount ||
        a.leaderName.localeCompare(b.leaderName)
    );

  // Members covered by at least one configured ChurchGroup with an assigned leader
  const coveredMemberIds = new Set<string>();
  for (const grp of churchGroups) {
    if (!isAssignedLeaderName(grp.leaderName)) continue;
    const groupKey = getCanonicalKey(grp.name);
    const memberSet = groupMemberIds.get(groupKey);
    if (memberSet) {
      for (const mId of memberSet) coveredMemberIds.add(mId);
    }
  }

  const activeConfiguredGroups = churchGroups.filter((g) => g.active !== false && normalizeLabel(g.name));
  const assignedPrimaryLeadersCount = activeConfiguredGroups.filter((g) =>
    isAssignedLeaderName(g.leaderName)
  ).length;
  const coLedGroupsCount = activeConfiguredGroups.filter((g) =>
    isAssignedLeaderName(g.assistantLeader)
  ).length;
  const unconfiguredGroupsCount = groups.filter((g) => !g.isConfiguredInDb).length;
  const unconfiguredDepartmentsCount = departments.filter(
    (d) =>
      !d.isConfiguredInDb &&
      d.name.toLowerCase() !== 'general' &&
      d.name.toLowerCase() !== 'general congregation'
  ).length;
  const configuredMissingLeader = churchGroups.filter(
    (g) => normalizeLabel(g.name) && !isAssignedLeaderName(g.leaderName)
  ).length;

  const leadership: LeadershipAnalyticsSummary = {
    configuredGroupsCount: churchGroups.filter((g) => normalizeLabel(g.name)).length,
    activeGroupsCount: activeConfiguredGroups.length,
    assignedPrimaryLeadersCount,
    coLedGroupsCount,
    distinctLeadersCount: leaders.length,
    groupsMissingLeaderCount: configuredMissingLeader + unconfiguredGroupsCount,
    unconfiguredGroupsCount,
    unconfiguredDepartmentsCount,
    membersUnderConfiguredLeadershipCount: coveredMemberIds.size,
    leadershipCoveragePct: pct(coveredMemberIds.size, totalMembers),
    leaders,
  };

  // 4. Multi-Service Comparison
  const serviceComparisons: ServiceComparisonRow[] = services.map((svc) => {
    const records = attendanceRecords.filter(
      (r) => r.serviceInstanceId === svc.id || (!r.serviceInstanceId && services.length <= 1)
    );
    const checkedInCount = records.length;
    const expected = Math.max(svc.expectedAttendance || 0, totalMembers > 0 ? totalMembers : 0);
    const onTime = records.filter((r) => !r.late).length;
    const auto = records.filter((r) => r.method === 'geofence' || r.method === 'beacon').length;
    const allowanceMinutes = svc.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
    const binaryStatus = computeServiceBinaryStatus({
      date: svc.date,
      startsAt: svc.startsAt,
      endsAt: svc.endsAt,
      startTimeIso: svc.startTimeIso,
      endTimeIso: svc.endTimeIso,
      allowanceMinutes,
      rawStatus: svc.status,
      nowMs: now.getTime(),
    });

    return {
      id: svc.id,
      name: svc.name,
      date: svc.date,
      startsAt: svc.startsAt,
      endsAt: svc.endsAt,
      startTimeIso: svc.startTimeIso,
      endTimeIso: svc.endTimeIso,
      dwellMinutes: allowanceMinutes,
      status: binaryStatus === 'live' ? 'open' : 'closed',
      binaryStatus,
      isActive: svc.id === currentService.id,
      checkedInCount,
      expectedAttendance: expected,
      fillRatePct: pct(checkedInCount, expected),
      onTimePct: pct(onTime, checkedInCount),
      autoPct: pct(auto, checkedInCount),
    };
  });

  // 5. Giving summary
  const paidDonations = donations.filter((d) => d.status === 'paid');
  const totalPaidMinor = paidDonations.reduce((acc, d) => acc + (d.amountMinor || 0), 0);
  const fundTotals = new Map<string, number>();
  for (const d of paidDonations) {
    const fund = normalizeLabel(d.fundName) || 'General Tithe';
    fundTotals.set(fund, (fundTotals.get(fund) || 0) + (d.amountMinor || 0));
  }
  let topFundName: string | null = null;
  let topFundAmount = -1;
  for (const [fund, amount] of fundTotals.entries()) {
    if (amount > topFundAmount) {
      topFundAmount = amount;
      topFundName = fund;
    }
  }

  const autoCheckinPct = pct(autoCheckinCount, totalMembers);
  const manualCheckinCount = Math.max(0, totalMembers - autoCheckinCount);
  const manualCheckinPct = totalMembers > 0 ? Math.max(0, 100 - autoCheckinPct) : 0;

  const activeAllowanceMinutes = currentService.dwellMinutes ?? systemSettings.dwellTimeMinutes ?? 5;
  const activeBinaryStatus = computeServiceBinaryStatus({
    date: currentService.date,
    startsAt: currentService.startsAt,
    endsAt: currentService.endsAt,
    startTimeIso: currentService.startTimeIso,
    endTimeIso: currentService.endTimeIso,
    allowanceMinutes: activeAllowanceMinutes,
    rawStatus: currentService.status,
    nowMs: now.getTime(),
  });

  return {
    activeService: {
      id: currentService.id,
      name: currentService.name,
      date: currentService.date,
      startsAt: currentService.startsAt,
      endsAt: currentService.endsAt,
      dwellMinutes: activeAllowanceMinutes,
      status: activeBinaryStatus === 'live' ? 'open' : 'closed',
      binaryStatus: activeBinaryStatus,
      attendanceCount,
      expectedAttendance,
      turnoutPct,
      absenteeCount,
      absenteePct,
      onTimeCount,
      lateCount,
      punctualityPct,
      autoCount,
      assistedCount,
      atRiskCount,
      channels,
      checkedInPersonIds,
    },
    membership: {
      totalMembers,
      activeStatusCount,
      visitorsCount,
      inactiveCount,
      autoCheckinCount,
      autoCheckinPct,
      manualCheckinCount,
      manualCheckinPct,
      openFollowupCount: followupTasks.filter((t) => t.status === 'open').length,
      birthdaysThisMonthCount,
      genderBreakdown: [
        { label: 'Male', count: maleCount, pct: pct(maleCount, totalMembers), color: '#6D5CF2' },
        { label: 'Female', count: femaleCount, pct: pct(femaleCount, totalMembers), color: '#4FBF98' },
        { label: 'Unspecified', count: otherGenderCount, pct: pct(otherGenderCount, totalMembers), color: '#94A3B8' },
      ].filter((item) => item.count > 0),
      maritalBreakdown: [
        { label: 'Married', count: marriedCount, pct: pct(marriedCount, totalMembers), color: '#6D5CF2' },
        { label: 'Single', count: singleCount, pct: pct(singleCount, totalMembers), color: '#59C3C3' },
        {
          label: 'Widowed / Divorced',
          count: widowedDivorcedCount,
          pct: pct(widowedDivorcedCount, totalMembers),
          color: '#F59E0B',
        },
        {
          label: 'Unspecified',
          count: unspecifiedMaritalCount,
          pct: pct(unspecifiedMaritalCount, totalMembers),
          color: '#94A3B8',
        },
      ].filter((item) => item.count > 0),
      completeness: {
        phoneCount,
        phonePct: pct(phoneCount, totalMembers),
        emailCount,
        emailPct: pct(emailCount, totalMembers),
        photoCount,
        photoPct: pct(photoCount, totalMembers),
        digitalAddressCount,
        digitalAddressPct: pct(digitalAddressCount, totalMembers),
        birthdayCount,
        birthdayPct: pct(birthdayCount, totalMembers),
      },
    },
    departments,
    namedDepartmentsCount,
    topDepartment,
    groups,
    groupCounts,
    leadership,
    serviceComparisons,
    giving: {
      totalPaidGhs: Math.round((totalPaidMinor / 100) * 100) / 100,
      donationsCount: paidDonations.length,
      topFundName,
    },
  };
}
