import {
  ChurchGroup,
  ChurchGroupCategory,
  FollowupTask,
  Person,
  SystemSettings,
} from '../types/ekklesphere';
import {
  getMemberPortfolio,
  getPortfolioPriorityScore,
  isPastoralOfficerOrLeader,
  isSeniorPastoralPortfolio,
} from '../constants/portfolios';
import { isDepartmentLikeCategory } from '../shared/groupCategories';
import {
  isBirthMonthGroupName,
  normalizeMonthName,
  resolveMemberBirthFields,
} from './birthMonth';
import {
  isGeneralCongregationLabel,
  parseMemberDepartments,
  resolveMemberDepartments,
} from './memberDepartments';
import {
  ALL_AUTOMATIC_DEMOGRAPHIC_MINISTRIES,
  AutomaticDemographicMinistryKind,
  getAutomaticMinistryKind,
  resolveAutomaticDemographicMinistries,
} from './demographicMinistries';

export type SettingsTabId =
  | 'general'
  | 'groups'
  | 'proximity'
  | 'pastoral'
  | 'privacy'
  | 'gateways'
  | 'staff'
  | 'billing';

export type AnalyticsLensId =
  | 'all'
  | 'departments'
  | 'ministries'
  | 'demographics'
  | 'services';

export interface SettingsGroupIntent {
  mode: 'create' | 'edit';
  groupId?: string;
  prefillName?: string;
  prefillCategory?: ChurchGroupCategory;
}

export interface AnalyticsJumpTarget {
  lens: AnalyticsLensId;
  searchQuery?: string;
  categoryFilter?: 'all' | ChurchGroupCategory;
  nonce: number;
}

export function normalizeSettingLabel(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isAssignedLeaderName(leaderName?: string | null): boolean {
  const clean = normalizeSettingLabel(leaderName).toLowerCase();
  return (
    Boolean(clean) &&
    clean !== 'unassigned' &&
    clean !== 'directory group' &&
    clean !== 'tbd' &&
    clean !== 'none'
  );
}

export function getMemberFullName(member: Pick<Person, 'firstName' | 'lastName'>): string {
  return normalizeSettingLabel(`${member.firstName || ''} ${member.lastName || ''}`);
}

export interface MemberLeaderResolution {
  status: 'matched' | 'empty' | 'ambiguous' | 'not_found';
  member?: Person;
  canonicalName?: string;
  matches?: Person[];
  error?: string;
}

export function resolveMemberLeaderInput(
  members: Person[],
  opts: {
    memberId?: string | null;
    inputName?: string | null;
    requireMatch?: boolean;
  }
): MemberLeaderResolution {
  const cleanInput = normalizeSettingLabel(opts.inputName);
  const cleanId = normalizeSettingLabel(opts.memberId);

  if (cleanId) {
    const byId = members.find((m) => m.id === cleanId || m.memberId === cleanId);
    if (byId) {
      const fullName = getMemberFullName(byId);
      const preferred = normalizeSettingLabel(byId.preferredName);
      if (
        !cleanInput ||
        fullName.toLowerCase() === cleanInput.toLowerCase() ||
        (preferred && preferred.toLowerCase() === cleanInput.toLowerCase()) ||
        byId.id.toLowerCase() === cleanInput.toLowerCase() ||
        (byId.memberId && byId.memberId.toLowerCase() === cleanInput.toLowerCase())
      ) {
        return {
          status: 'matched',
          member: byId,
          canonicalName: fullName,
        };
      }
    }
  }

  if (!cleanInput) {
    return {
      status: 'empty',
      ...(opts.requireMatch
        ? { error: 'Primary leader must be selected from your members list.' }
        : {}),
    };
  }

  if (members.length === 0) {
    return {
      status: 'not_found',
      error: 'No enrolled members found yet. Add members in the directory first before assigning a leader.',
    };
  }

  const targetLower = cleanInput.toLowerCase();
  const fullNameMatches = members.filter(
    (m) => getMemberFullName(m).toLowerCase() === targetLower
  );

  if (fullNameMatches.length === 1) {
    return {
      status: 'matched',
      member: fullNameMatches[0],
      canonicalName: getMemberFullName(fullNameMatches[0]),
    };
  }
  if (fullNameMatches.length > 1) {
    return {
      status: 'ambiguous',
      matches: fullNameMatches,
      error: 'Multiple members share this name. Click the specific member from the dropdown list.',
    };
  }

  const secondaryMatches = members.filter((m) => {
    const preferred = normalizeSettingLabel(m.preferredName).toLowerCase();
    const code = normalizeSettingLabel(m.memberId).toLowerCase();
    const email = normalizeSettingLabel(m.email).toLowerCase();
    return (
      (preferred && preferred === targetLower) ||
      (code && code === targetLower) ||
      (email && email === targetLower)
    );
  });

  if (secondaryMatches.length === 1) {
    return {
      status: 'matched',
      member: secondaryMatches[0],
      canonicalName: getMemberFullName(secondaryMatches[0]),
    };
  }
  if (secondaryMatches.length > 1) {
    return {
      status: 'ambiguous',
      matches: secondaryMatches,
      error: 'Multiple members match this entry. Select one from the members dropdown.',
    };
  }

  return {
    status: 'not_found',
    error: 'Leader must match an enrolled member from your congregation members list.',
  };
}

export function filterMembersForLeaderPicker(
  members: Person[],
  query: string,
  options?: { excludeMemberId?: string | null; limit?: number }
): Person[] {
  const q = normalizeSettingLabel(query).toLowerCase();
  const excluded = normalizeSettingLabel(options?.excludeMemberId);
  const limit = options?.limit ?? 12;

  const eligible = members.filter((m) => !excluded || m.id !== excluded);

  const ranked = eligible
    .map((m) => {
      const fullName = getMemberFullName(m);
      const fullLower = fullName.toLowerCase();
      const preferred = normalizeSettingLabel(m.preferredName).toLowerCase();
      const phone = normalizeSettingLabel(m.phoneE164).toLowerCase();
      const email = normalizeSettingLabel(m.email).toLowerCase();
      const code = normalizeSettingLabel(m.memberId).toLowerCase();
      const dept = normalizeSettingLabel(m.department || m.homeCellGroup || m.groupName).toLowerCase();

      if (!q) {
        return { member: m, score: m.status === 'member' ? 2 : 1, fullLower };
      }

      if (fullLower === q || code === q) return { member: m, score: 100, fullLower };
      if (fullLower.startsWith(q)) return { member: m, score: 80, fullLower };
      if (
        fullLower.includes(q) ||
        preferred.includes(q) ||
        code.includes(q) ||
        phone.includes(q) ||
        email.includes(q) ||
        dept.includes(q)
      ) {
        return { member: m, score: 50, fullLower };
      }
      return null;
    })
    .filter((entry): entry is { member: Person; score: number; fullLower: string } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.fullLower.localeCompare(b.fullLower));

  return ranked.slice(0, limit).map((entry) => entry.member);
}

export function getActiveGroupsByCategory(churchGroups: ChurchGroup[]) {
  const activeGroups = churchGroups.filter((g) => g.active !== false);
  return {
    activeGroups,
    ministries: activeGroups.filter((g) => g.category === 'ministry'),
    fellowships: activeGroups.filter((g) => g.category === 'fellowship'),
    cellGroups: activeGroups.filter((g) => g.category === 'cell_group'),
  };
}

export function memberMatchesChurchGroup(member: Person, groupName?: string | null): boolean {
  const target = normalizeSettingLabel(groupName).toLowerCase();
  if (!target) return false;

  const targetAutoKind = getAutomaticMinistryKind(groupName);
  if (targetAutoKind) {
    const memberAuto = resolveAutomaticDemographicMinistries(member);
    if (memberAuto.kinds.includes(targetAutoKind)) {
      return true;
    }
  }

  const resolvedBirth = resolveMemberBirthFields({
    dateOfBirth: member.dateOfBirth,
    monthOfBirth: member.monthOfBirth,
    birthMonthGroup: member.birthMonthGroup,
  });

  if (isBirthMonthGroupName(groupName) && resolvedBirth.monthOfBirth) {
    const targetMonth = normalizeMonthName(groupName);
    if (targetMonth && targetMonth === resolvedBirth.monthOfBirth) {
      return true;
    }
  }

  const memberDepts = resolveMemberDepartments(member);
  const candidates = [
    member.groupName,
    member.homeCellGroup,
    member.department,
    ...memberDepts,
    resolvedBirth.birthMonthGroup,
  ]
    .map((val) => normalizeSettingLabel(val).toLowerCase())
    .filter(Boolean);

  if (candidates.length === 0) return false;

  return candidates.some(
    (candidate) =>
      candidate === target ||
      (target.length >= 4 && candidate.includes(target)) ||
      (candidate.length >= 4 && target.includes(candidate))
  );
}

export function findMatchingChurchGroup(
  churchGroups: ChurchGroup[],
  criteria: {
    groupName?: string | null;
    homeCellGroup?: string | null;
    department?: string | string[] | null;
    gender?: string | null;
    dateOfBirth?: string | null;
  }
): {
  cellOrFellowshipGroup: ChurchGroup | null;
  ministryGroup: ChurchGroup | null;
  ministryGroups: ChurchGroup[];
} {
  const ordered = [
    ...churchGroups.filter((g) => g.active !== false),
    ...churchGroups.filter((g) => g.active === false),
  ];

  const findByName = (raw?: string | null, preferredCategories?: ChurchGroup['category'][]) => {
    const target = normalizeSettingLabel(raw).toLowerCase();
    if (!target || target === 'general' || target === 'general congregation' || target === 'first-time visitor') {
      return null;
    }
    const exactPreferred = ordered.find(
      (g) =>
        (!preferredCategories || preferredCategories.includes(g.category)) &&
        normalizeSettingLabel(g.name).toLowerCase() === target
    );
    if (exactPreferred) return exactPreferred;

    const exactAny = ordered.find(
      (g) => normalizeSettingLabel(g.name).toLowerCase() === target
    );
    if (exactAny) return exactAny;

    const targetAutoKind = getAutomaticMinistryKind(raw);
    if (targetAutoKind) {
      const autoPreferred = ordered.find(
        (g) =>
          (!preferredCategories || preferredCategories.includes(g.category)) &&
          getAutomaticMinistryKind(g.name) === targetAutoKind
      );
      if (autoPreferred) return autoPreferred;

      const autoAny = ordered.find(
        (g) => getAutomaticMinistryKind(g.name) === targetAutoKind
      );
      if (autoAny) return autoAny;
    }

    return (
      ordered.find((g) => {
        if (preferredCategories && !preferredCategories.includes(g.category)) return false;
        const gName = normalizeSettingLabel(g.name).toLowerCase();
        return gName.includes(target) || target.includes(gName);
      }) || null
    );
  };

  const cellOrFellowshipGroup =
    findByName(criteria.homeCellGroup, ['cell_group', 'fellowship']) ||
    findByName(criteria.groupName, ['cell_group', 'fellowship']) ||
    findByName(criteria.homeCellGroup || criteria.groupName);

  const explicitDeptList = parseMemberDepartments(criteria.department);
  const autoDeptNames =
    criteria.gender || criteria.dateOfBirth
      ? resolveAutomaticDemographicMinistries({
          gender: criteria.gender,
          dateOfBirth: criteria.dateOfBirth,
        }).names
      : [];
  const deptList = [...explicitDeptList, ...autoDeptNames];

  const matchedMinistryMap = new Map<string, ChurchGroup>();
  for (const deptName of deptList) {
    const found =
      findByName(deptName, ['ministry', 'department']) || findByName(deptName);
    if (found && !matchedMinistryMap.has(found.id)) {
      matchedMinistryMap.set(found.id, found);
    }
  }
  if (matchedMinistryMap.size === 0 && criteria.groupName) {
    const fallbackGroup = findByName(criteria.groupName, ['ministry', 'department']);
    if (fallbackGroup) {
      matchedMinistryMap.set(fallbackGroup.id, fallbackGroup);
    }
  }

  const ministryGroups = Array.from(matchedMinistryMap.values());
  const ministryGroup = ministryGroups[0] || null;

  return { cellOrFellowshipGroup, ministryGroup, ministryGroups };
}

export function mergeSelectableDepartments(
  churchGroups: ChurchGroup[],
  members: Person[],
  fallbackDefaults: readonly string[] = []
): string[] {
  const seen = new Map<string, string>();
  const seenAutoKinds = new Set<AutomaticDemographicMinistryKind>();
  const addUnique = (raw?: string | null) => {
    const clean = normalizeSettingLabel(raw);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
    const kind = getAutomaticMinistryKind(clean);
    if (kind) seenAutoKinds.add(kind);
  };

  addUnique('General Congregation');

  churchGroups
    .filter((g) => g.active !== false && isDepartmentLikeCategory(g.category))
    .forEach((g) => addUnique(g.name));

  members.forEach((m) => {
    resolveMemberDepartments(m).forEach((dept) => addUnique(dept));
  });

  if (fallbackDefaults.length > 0) {
    fallbackDefaults.forEach((d) => addUnique(d));
  }

  ALL_AUTOMATIC_DEMOGRAPHIC_MINISTRIES.forEach((autoDef) => {
    if (!seenAutoKinds.has(autoDef.kind)) {
      addUnique(autoDef.name);
    }
  });

  return Array.from(seen.values());
}

export function mergeSelectableCellGroups(
  churchGroups: ChurchGroup[],
  members: Person[],
  fallbackDefaults: readonly string[] = []
): string[] {
  const seen = new Map<string, string>();
  const addUnique = (raw?: string | null) => {
    const clean = normalizeSettingLabel(raw);
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };

  churchGroups
    .filter((g) => g.active !== false && !isDepartmentLikeCategory(g.category))
    .forEach((g) => addUnique(g.name));

  members.forEach((m) => {
    addUnique(m.homeCellGroup);
    addUnique(m.groupName);
  });

  if (fallbackDefaults.length > 0) {
    fallbackDefaults.forEach((g) => addUnique(g));
  }

  return Array.from(seen.values());
}

export interface ResolvedFollowupAssignee {
  assignedToName: string;
  groupName: string;
  assignedToMemberId?: string;
  assignedToRole?: string;
  assignedToPhone?: string;
}

export interface AutoAssignAbsenteesPlanItem {
  personId: string;
  personName: string;
  personPhone?: string;
  personEmail?: string;
  groupName: string;
  reason: FollowupTask['reason'];
  assignedToName: string;
  assignedToMemberId?: string;
  assignedToRole?: string;
  assignedToPhone?: string;
  dueOn: string;
  notes: string;
}

function getMemberGroupMatchScore(candidate: Person, targetMember?: Person): number {
  if (!targetMember) return 0;
  const targetCell = normalizeSettingLabel(targetMember.homeCellGroup || targetMember.groupName).toLowerCase();
  const candCell = normalizeSettingLabel(candidate.homeCellGroup || candidate.groupName).toLowerCase();

  let score = 0;
  if (
    targetCell &&
    !isGeneralCongregationLabel(targetCell) &&
    candCell &&
    candCell === targetCell
  ) {
    score += 40;
  }

  const targetDepts = new Set(resolveMemberDepartments(targetMember).map((d) => d.toLowerCase()));
  if (targetDepts.size > 0) {
    const candDepts = resolveMemberDepartments(candidate).map((d) => d.toLowerCase());
    if (candDepts.some((d) => targetDepts.has(d))) {
      score += 30;
    }
  }
  return score;
}

function pickBestOfficerOrLeader(
  candidates: Person[],
  targetMember: Person | undefined,
  reason: FollowupTask['reason'],
  loadByName: Map<string, number>
): Person | undefined {
  if (candidates.length === 0) return undefined;
  const targetId = targetMember?.id;
  const eligible = candidates.filter((c) => c.id !== targetId);
  if (eligible.length === 0) return undefined;

  const sorted = [...eligible].sort((a, b) => {
    const aName = getMemberFullName(a).toLowerCase();
    const bName = getMemberFullName(b).toLowerCase();
    const aLoad = loadByName.get(aName) ?? 0;
    const bLoad = loadByName.get(bName) ?? 0;

    // Group affinity comes first for standard follow-ups; senior escalation prioritizes senior roles
    const aGroupAffinity = getMemberGroupMatchScore(a, targetMember);
    const bGroupAffinity = getMemberGroupMatchScore(b, targetMember);
    const aSeniorBoost =
      reason === 'absent_3' && isSeniorPastoralPortfolio(getMemberPortfolio(a)) ? 35 : 0;
    const bSeniorBoost =
      reason === 'absent_3' && isSeniorPastoralPortfolio(getMemberPortfolio(b)) ? 35 : 0;

    // Prefer least-loaded officer/leader first when affinity tier matches
    const aScore = aGroupAffinity + aSeniorBoost - aLoad * 25 + getPortfolioPriorityScore(getMemberPortfolio(a)) * 0.15;
    const bScore = bGroupAffinity + bSeniorBoost - bLoad * 25 + getPortfolioPriorityScore(getMemberPortfolio(b)) * 0.15;
    if (bScore !== aScore) return bScore - aScore;
    return aName.localeCompare(bName);
  });

  return sorted[0];
}

export function resolveFollowupAssignee(
  member: Person | undefined,
  churchGroups: ChurchGroup[],
  systemSettings: SystemSettings,
  reason: FollowupTask['reason'],
  fallbackActorName?: string,
  allMembers: Person[] = [],
  existingOpenTasks: FollowupTask[] = [],
  loadOverride?: Map<string, number>
): ResolvedFollowupAssignee {
  const memberDepts = member ? resolveMemberDepartments(member) : [];
  const memberGroupLabel =
    normalizeSettingLabel(member?.homeCellGroup) ||
    normalizeSettingLabel(member?.groupName) ||
    memberDepts[0] ||
    normalizeSettingLabel(member?.department) ||
    'General';

  const { cellOrFellowshipGroup, ministryGroups } = findMatchingChurchGroup(churchGroups, {
    groupName: member?.groupName,
    homeCellGroup: member?.homeCellGroup,
    department: memberDepts.length > 0 ? memberDepts : member?.department,
  });
  const selfFullNameLower = member ? getMemberFullName(member).toLowerCase() : '';
  const leadMinistryGroup =
    ministryGroups.find(
      (g) =>
        normalizeSettingLabel(g.leaderName) &&
        (!member || normalizeSettingLabel(g.leaderName).toLowerCase() !== selfFullNameLower)
    ) || ministryGroups[0] || null;

  const resolvedGroupName = cellOrFellowshipGroup?.name || leadMinistryGroup?.name || memberGroupLabel;

  const loadByName = loadOverride || new Map<string, number>();
  if (!loadOverride && existingOpenTasks.length > 0) {
    for (const t of existingOpenTasks) {
      if (t.status === 'open' || t.status === 'contacted') {
        const key = normalizeSettingLabel(t.assignedToName).toLowerCase();
        if (key) loadByName.set(key, (loadByName.get(key) || 0) + 1);
      }
    }
  }

  const seniorPastorFallback =
    normalizeSettingLabel(systemSettings.seniorPastor) ||
    normalizeSettingLabel(fallbackActorName) ||
    'Pastoral Care Team';

  // Lookup matching member record for a named group leader so we retain ID, phone & portfolio
  const findMemberByLeader = (leaderMemberId?: string, leaderName?: string): Person | undefined => {
    if (leaderMemberId) {
      const byId = allMembers.find((m) => m.id === leaderMemberId);
      if (byId && byId.id !== member?.id) return byId;
    }
    const clean = normalizeSettingLabel(leaderName).toLowerCase();
    if (!clean) return undefined;
    return allMembers.find((m) => m.id !== member?.id && getMemberFullName(m).toLowerCase() === clean);
  };

  const cellLeaderName = cellOrFellowshipGroup?.leaderName?.trim() || '';
  const ministryLeaderName = leadMinistryGroup?.leaderName?.trim() || '';

  const pastoralOfficers = allMembers.filter((m) => isPastoralOfficerOrLeader(m));
  const bestOfficer = pickBestOfficerOrLeader(pastoralOfficers, member, reason, loadByName);

  // If the absentee member happens to be the group's own leader, don't self-assign!
  const matchedGroupLeaderName =
    cellLeaderName &&
    (!member || cellLeaderName.toLowerCase() !== selfFullNameLower)
      ? cellLeaderName
      : ministryLeaderName &&
        (!member || ministryLeaderName.toLowerCase() !== selfFullNameLower)
      ? ministryLeaderName
      : '';

  const matchedGroupRef =
    matchedGroupLeaderName === cellLeaderName ? cellOrFellowshipGroup : leadMinistryGroup;
  const matchedLeaderMember = matchedGroupLeaderName
    ? findMemberByLeader(matchedGroupRef?.leaderMemberId, matchedGroupLeaderName)
    : undefined;

  if (systemSettings.autoAssignCellLeaders) {
    if (reason === 'absent_3') {
      // Escalate severe absences to Senior Pastor -> Elder/Deacon/Officer -> Group Leader
      const seniorName = normalizeSettingLabel(systemSettings.seniorPastor);
      if (seniorName && (!member || seniorName.toLowerCase() !== getMemberFullName(member).toLowerCase())) {
        const seniorMember = findMemberByLeader(undefined, seniorName);
        return {
          assignedToName: seniorName,
          groupName: resolvedGroupName,
          assignedToMemberId: seniorMember?.id,
          assignedToRole: seniorMember ? getMemberPortfolio(seniorMember) : 'Senior Pastor',
          assignedToPhone: seniorMember?.phoneE164 || systemSettings.contactPhone || undefined,
        };
      }
      if (bestOfficer) {
        return {
          assignedToName: getMemberFullName(bestOfficer),
          groupName: resolvedGroupName,
          assignedToMemberId: bestOfficer.id,
          assignedToRole: getMemberPortfolio(bestOfficer),
          assignedToPhone: bestOfficer.phoneE164 || undefined,
        };
      }
    }

    if (matchedGroupLeaderName) {
      return {
        assignedToName: matchedGroupLeaderName,
        groupName: resolvedGroupName,
        assignedToMemberId: matchedLeaderMember?.id || matchedGroupRef?.leaderMemberId || undefined,
        assignedToRole: matchedLeaderMember
          ? getMemberPortfolio(matchedLeaderMember)
          : cellLeaderName === matchedGroupLeaderName
          ? 'Cell Leader'
          : 'Ministry Leader',
        assignedToPhone:
          matchedLeaderMember?.phoneE164 || matchedGroupRef?.leaderPhone || undefined,
      };
    }

    // No explicit group leader matched: assign to matching congregation Officer (Deacon, Deaconess, Elder, Pastor, Leader)
    if (bestOfficer) {
      return {
        assignedToName: getMemberFullName(bestOfficer),
        groupName: resolvedGroupName,
        assignedToMemberId: bestOfficer.id,
        assignedToRole: getMemberPortfolio(bestOfficer),
        assignedToPhone: bestOfficer.phoneE164 || undefined,
      };
    }
  } else if (bestOfficer && reason !== 'absent_3') {
    const seniorMember = findMemberByLeader(undefined, seniorPastorFallback);
    return {
      assignedToName: seniorPastorFallback,
      groupName: resolvedGroupName,
      assignedToMemberId: seniorMember?.id,
      assignedToRole: seniorMember ? getMemberPortfolio(seniorMember) : 'Senior Pastor',
      assignedToPhone: seniorMember?.phoneE164 || systemSettings.contactPhone || undefined,
    };
  }

  return {
    assignedToName: seniorPastorFallback,
    groupName: resolvedGroupName,
  };
}

export function buildAutoAssignAbsenteesPlan(params: {
  members: Person[];
  churchGroups: ChurchGroup[];
  existingTasks: FollowupTask[];
  systemSettings: SystemSettings;
  fallbackActorName?: string;
  unarrivedMemberIdsForLatestService?: Set<string>;
}): AutoAssignAbsenteesPlanItem[] {
  const {
    members,
    churchGroups,
    existingTasks,
    systemSettings,
    fallbackActorName,
    unarrivedMemberIdsForLatestService,
  } = params;

  const threshold = Math.max(1, Number(systemSettings.absenteeThresholdServices) || 2);
  const activeTaskPersonIds = new Set(
    existingTasks
      .filter((t) => t.status === 'open' || t.status === 'contacted')
      .map((t) => String(t.personId))
  );

  // Track live open caseload so assignments distribute fairly across Officers & Cell Leaders
  const loadByName = new Map<string, number>();
  for (const t of existingTasks) {
    if (t.status === 'open' || t.status === 'contacted') {
      const key = normalizeSettingLabel(t.assignedToName).toLowerCase();
      if (key) loadByName.set(key, (loadByName.get(key) || 0) + 1);
    }
  }

  const plan: AutoAssignAbsenteesPlanItem[] = [];

  for (const member of members) {
    if (member.status === 'inactive' || member.status === 'transferred' || member.status === 'deceased') {
      continue;
    }
    if (activeTaskPersonIds.has(String(member.id))) {
      continue;
    }

    const consecutive = Number(member.consecutiveAbsences || 0);
    const isAbsentByStreak = consecutive >= threshold;
    const isAbsentInService = Boolean(unarrivedMemberIdsForLatestService?.has(member.id));
    if (!isAbsentByStreak && !isAbsentInService) {
      continue;
    }

    const effectiveStreak = Math.max(consecutive, isAbsentInService ? threshold : 0);
    const reason: FollowupTask['reason'] =
      effectiveStreak >= threshold + 1 ? 'absent_3' : 'absent_2';

    const resolved = resolveFollowupAssignee(
      member,
      churchGroups,
      systemSettings,
      reason,
      fallbackActorName,
      members,
      existingTasks,
      loadByName
    );

    const assigneeKey = normalizeSettingLabel(resolved.assignedToName).toLowerCase();
    if (assigneeKey) {
      loadByName.set(assigneeKey, (loadByName.get(assigneeKey) || 0) + 1);
    }
    activeTaskPersonIds.add(String(member.id));

    const dueOn = formatFollowupDueDateLabel(
      reason,
      systemSettings.firstTimerFollowupHours,
      threshold
    );

    const roleHint = resolved.assignedToRole ? ` (${resolved.assignedToRole})` : '';
    plan.push({
      personId: member.id,
      personName: getMemberFullName(member) || 'Member',
      personPhone: member.phoneE164 || member.phoneNumber || undefined,
      personEmail: member.email || undefined,
      groupName: resolved.groupName,
      reason,
      assignedToName: resolved.assignedToName,
      assignedToMemberId: resolved.assignedToMemberId,
      assignedToRole: resolved.assignedToRole,
      assignedToPhone: resolved.assignedToPhone,
      dueOn,
      notes: `Auto-assigned to ${resolved.assignedToName}${roleHint} after ${effectiveStreak} missed service${
        effectiveStreak === 1 ? '' : 's'
      }.`,
    });
  }

  return plan;
}

export function formatFollowupDueDateLabel(
  reason: FollowupTask['reason'],
  firstTimerFollowupHours: number = 24,
  absenteeThresholdServices: number = 2
): string {
  const safeHours = Math.max(1, Math.round(firstTimerFollowupHours || 24));
  if (reason === 'first_timer') {
    if (safeHours <= 24) return `Within ${safeHours}h`;
    const days = Math.round(safeHours / 24);
    return `Within ${days} day${days === 1 ? '' : 's'} (${safeHours}h)`;
  }
  if (reason === 'absent_3') {
    return `Urgent (${absenteeThresholdServices + 1}w escalation)`;
  }
  if (reason === 'absent_2') {
    return `Within 72h (${absenteeThresholdServices}w trigger)`;
  }
  return 'In 3 days';
}

export interface CurrencyDisplayInfo {
  code: string;
  symbol: string;
  label: string;
  presetAmounts: number[];
}

export function getCurrencyDisplay(currencySetting?: string | null): CurrencyDisplayInfo {
  const raw = normalizeSettingLabel(currencySetting) || 'GHS (Ghana Cedi)';
  const upper = raw.toUpperCase();
  if (upper.startsWith('USD')) {
    return { code: 'USD', symbol: '$', label: raw, presetAmounts: [10, 25, 50, 100] };
  }
  if (upper.startsWith('GBP')) {
    return { code: 'GBP', symbol: '£', label: raw, presetAmounts: [10, 20, 50, 100] };
  }
  if (upper.startsWith('EUR')) {
    return { code: 'EUR', symbol: '€', label: raw, presetAmounts: [10, 25, 50, 100] };
  }
  if (upper.startsWith('NGN')) {
    return { code: 'NGN', symbol: '₦', label: raw, presetAmounts: [1000, 2500, 5000, 10000] };
  }
  return { code: 'GHS', symbol: 'GHS', label: raw, presetAmounts: [20, 50, 100, 200] };
}
