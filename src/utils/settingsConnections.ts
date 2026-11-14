import {
  ChurchGroup,
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

export function normalizeSettingLabel(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
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
