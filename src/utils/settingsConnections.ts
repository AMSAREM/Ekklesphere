import {
  ChurchGroup,
  ChurchGroupCategory,
  FollowupTask,
  Person,
  SystemSettings,
} from '../types/ekklesphere';

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

  const candidates = [member.groupName, member.homeCellGroup, member.department]
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
    department?: string | null;
  }
): { cellOrFellowshipGroup: ChurchGroup | null; ministryGroup: ChurchGroup | null } {
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

  const ministryGroup =
    findByName(criteria.department, ['ministry']) ||
    findByName(criteria.department) ||
    findByName(criteria.groupName, ['ministry']);

  return { cellOrFellowshipGroup, ministryGroup };
}

export function mergeSelectableDepartments(
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

  addUnique('General Congregation');

  churchGroups
    .filter((g) => g.active !== false && g.category === 'ministry')
    .forEach((g) => addUnique(g.name));

  members.forEach((m) => addUnique(m.department));

  if (fallbackDefaults.length > 0) {
    fallbackDefaults.forEach((d) => addUnique(d));
  }

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
    .filter((g) => g.active !== false && (g.category === 'cell_group' || g.category === 'fellowship'))
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

export function resolveFollowupAssignee(
  member: Person | undefined,
  churchGroups: ChurchGroup[],
  systemSettings: SystemSettings,
  reason: FollowupTask['reason'],
  fallbackActorName?: string
): { assignedToName: string; groupName: string } {
  const memberGroupLabel =
    normalizeSettingLabel(member?.homeCellGroup) ||
    normalizeSettingLabel(member?.groupName) ||
    normalizeSettingLabel(member?.department) ||
    'General';

  const { cellOrFellowshipGroup, ministryGroup } = findMatchingChurchGroup(churchGroups, {
    groupName: member?.groupName,
    homeCellGroup: member?.homeCellGroup,
    department: member?.department,
  });

  const matchedLeader =
    cellOrFellowshipGroup?.leaderName?.trim() ||
    ministryGroup?.leaderName?.trim() ||
    '';

  const seniorPastorFallback =
    normalizeSettingLabel(systemSettings.seniorPastor) ||
    normalizeSettingLabel(fallbackActorName) ||
    'Pastoral Care Team';

  if (systemSettings.autoAssignCellLeaders) {
    if (reason === 'absent_3') {
      return {
        assignedToName:
          normalizeSettingLabel(systemSettings.seniorPastor) ||
          matchedLeader ||
          seniorPastorFallback,
        groupName: cellOrFellowshipGroup?.name || ministryGroup?.name || memberGroupLabel,
      };
    }

    if (matchedLeader) {
      return {
        assignedToName: matchedLeader,
        groupName: cellOrFellowshipGroup?.name || ministryGroup?.name || memberGroupLabel,
      };
    }
  }

  return {
    assignedToName: seniorPastorFallback,
    groupName: cellOrFellowshipGroup?.name || ministryGroup?.name || memberGroupLabel,
  };
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
