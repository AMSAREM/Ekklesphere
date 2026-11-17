import {
  BuiltInChurchGroupCategory,
  ChurchGroup,
  ChurchGroupCategory,
  ChurchGroupCategoryDefinition,
  ChurchGroupLeadershipHistoryEntry,
  GroupCategoryColor,
} from '../types/ekklesphere';
import {
  ALL_BIRTH_MONTH_GROUPS,
  isBirthMonthGroupName,
  normalizeMonthName,
} from '../utils/birthMonth';
import {
  ALL_AUTOMATIC_DEMOGRAPHIC_MINISTRIES,
  AutomaticDemographicMinistryKind,
  getAutomaticMinistryKind,
} from '../utils/demographicMinistries';

export const BUILT_IN_GROUP_CATEGORIES: readonly ChurchGroupCategoryDefinition[] = [
  {
    id: 'cell_group',
    label: 'Cell Group',
    pluralLabel: 'Cell Groups',
    description: 'Home Small Group',
    color: 'emerald',
    isBuiltIn: true,
  },
  {
    id: 'ministry',
    label: 'Ministry',
    pluralLabel: 'Ministries',
    description: 'Ministry Wing',
    color: 'indigo',
    isBuiltIn: true,
  },
  {
    id: 'fellowship',
    label: 'Fellowship',
    pluralLabel: 'Fellowships',
    description: 'Demographic Wing',
    color: 'sky',
    isBuiltIn: true,
  },
] as const;

export const CUSTOM_GROUP_CATEGORY_PRESETS: readonly {
  label: string;
  pluralLabel: string;
  description: string;
  color: GroupCategoryColor;
}[] = [
  {
    label: 'Department',
    pluralLabel: 'Departments',
    description: 'Operational & Service Unit',
    color: 'violet',
  },
  {
    label: 'Month Born',
    pluralLabel: 'Month Born Groups',
    description: 'Birth Month Fellowship',
    color: 'amber',
  },
  {
    label: 'Age / Peer Band',
    pluralLabel: 'Age / Peer Bands',
    description: 'Generational Cohort',
    color: 'teal',
  },
  {
    label: 'District / Zone',
    pluralLabel: 'Districts & Zones',
    description: 'Regional / Geographic Wing',
    color: 'rose',
  },
] as const;

export const GROUP_CATEGORY_COLOR_OPTIONS: readonly {
  id: GroupCategoryColor;
  label: string;
  swatchClass: string;
}[] = [
  { id: 'violet', label: 'Violet', swatchClass: 'bg-violet-500' },
  { id: 'amber', label: 'Amber', swatchClass: 'bg-amber-500' },
  { id: 'teal', label: 'Teal', swatchClass: 'bg-teal-500' },
  { id: 'rose', label: 'Rose', swatchClass: 'bg-rose-500' },
  { id: 'indigo', label: 'Indigo', swatchClass: 'bg-[#6D5CF2]' },
  { id: 'sky', label: 'Sky', swatchClass: 'bg-sky-500' },
  { id: 'emerald', label: 'Emerald', swatchClass: 'bg-emerald-500' },
] as const;

const VALID_COLORS = new Set<GroupCategoryColor>([
  'indigo',
  'emerald',
  'sky',
  'violet',
  'amber',
  'rose',
  'teal',
]);

const BUILT_IN_IDS = new Set<string>(BUILT_IN_GROUP_CATEGORIES.map((c) => c.id));

export const CATEGORY_SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizeGroupCategorySlug(input?: string | null): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 64);
}

export function isValidGroupCategorySlug(value?: string | null): boolean {
  const clean = String(value || '').trim().toLowerCase();
  return CATEGORY_SLUG_REGEX.test(clean);
}

export function normalizeIncomingGroupCategory(input?: string | null): ChurchGroupCategory | null {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;
  if (BUILT_IN_IDS.has(raw)) return raw as BuiltInChurchGroupCategory;
  if (isValidGroupCategorySlug(raw)) return raw;
  const normalized = normalizeGroupCategorySlug(raw);
  return isValidGroupCategorySlug(normalized) ? normalized : null;
}

export function humanizeGroupCategorySlug(slug: string): string {
  const clean = String(slug || '').trim();
  if (!clean) return 'Group';
  return clean
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function pluralizeCategoryLabel(label: string): string {
  const clean = String(label || '').trim();
  if (!clean) return 'Groups';
  const lower = clean.toLowerCase();
  if (lower.endsWith('s') || lower.endsWith('group') || lower.endsWith('band') || lower.endsWith('wing')) {
    return lower.endsWith('s') ? clean : `${clean}s`;
  }
  if (lower.endsWith('born')) {
    return `${clean} Groups`;
  }
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(lower)) {
    return `${clean.slice(0, -1)}ies`;
  }
  return `${clean}s`;
}

export function sanitizeCustomGroupCategories(
  input: unknown
): ChurchGroupCategoryDefinition[] {
  if (!Array.isArray(input)) return [];
  const seenIds = new Set<string>();
  const result: ChurchGroupCategoryDefinition[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const rawLabel = String(obj.label || '').trim().replace(/\s+/g, ' ').slice(0, 48);
    const rawId = normalizeGroupCategorySlug(String(obj.id || rawLabel));
    if (!rawId || !isValidGroupCategorySlug(rawId) || BUILT_IN_IDS.has(rawId) || seenIds.has(rawId)) {
      continue;
    }
    const label = rawLabel || humanizeGroupCategorySlug(rawId);
    const rawPlural = String(obj.pluralLabel || '').trim().replace(/\s+/g, ' ').slice(0, 56);
    const pluralLabel = rawPlural || pluralizeCategoryLabel(label);
    const description = String(obj.description || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const rawColor = String(obj.color || '').trim().toLowerCase() as GroupCategoryColor;
    const color: GroupCategoryColor = VALID_COLORS.has(rawColor) ? rawColor : 'violet';
    const createdAt = typeof obj.createdAt === 'string' && obj.createdAt.trim()
      ? obj.createdAt.trim().slice(0, 40)
      : undefined;

    seenIds.add(rawId);
    result.push({
      id: rawId,
      label,
      pluralLabel,
      description: description || 'Custom Category',
      color,
      isBuiltIn: false,
      ...(createdAt ? { createdAt } : {}),
    });
    if (result.length >= 50) break;
  }

  return result;
}

export function getAllGroupCategories(
  customCategories?: ChurchGroupCategoryDefinition[],
  existingGroups?: Pick<ChurchGroup, 'category'>[],
  historyEntries?: Pick<ChurchGroupLeadershipHistoryEntry, 'category'>[]
): ChurchGroupCategoryDefinition[] {
  const sanitizedCustom = sanitizeCustomGroupCategories(customCategories);
  const byId = new Map<string, ChurchGroupCategoryDefinition>();

  for (const builtIn of BUILT_IN_GROUP_CATEGORIES) {
    byId.set(builtIn.id, { ...builtIn });
  }
  for (const custom of sanitizedCustom) {
    byId.set(custom.id, custom);
  }

  const extraSlugs = new Set<string>();
  for (const g of existingGroups || []) {
    const slug = String(g.category || '').trim().toLowerCase();
    if (slug && !byId.has(slug)) extraSlugs.add(slug);
  }
  for (const h of historyEntries || []) {
    const slug = String(h.category || '').trim().toLowerCase();
    if (slug && !byId.has(slug)) extraSlugs.add(slug);
  }

  for (const slug of extraSlugs) {
    const label = humanizeGroupCategorySlug(slug);
    byId.set(slug, {
      id: slug,
      label,
      pluralLabel: pluralizeCategoryLabel(label),
      description: 'Custom Category',
      color: 'violet',
      isBuiltIn: false,
    });
  }

  return Array.from(byId.values());
}

export function getGroupCategoryMeta(
  category: string,
  customCategories?: ChurchGroupCategoryDefinition[]
): ChurchGroupCategoryDefinition {
  const clean = String(category || '').trim().toLowerCase();
  const builtIn = BUILT_IN_GROUP_CATEGORIES.find((c) => c.id === clean);
  if (builtIn) return builtIn;

  const custom = sanitizeCustomGroupCategories(customCategories).find((c) => c.id === clean);
  if (custom) return custom;

  const label = humanizeGroupCategorySlug(clean || 'group');
  return {
    id: clean || 'group',
    label,
    pluralLabel: pluralizeCategoryLabel(label),
    description: 'Custom Category',
    color: 'violet',
    isBuiltIn: false,
  };
}

export function isDepartmentLikeCategory(category?: string | null): boolean {
  const clean = String(category || '').trim().toLowerCase();
  return (
    clean === 'ministry' ||
    clean === 'department' ||
    clean.includes('department') ||
    clean.includes('dept') ||
    clean.includes('ministry')
  );
}

export function isMonthBornCategory(category?: string | null): boolean {
  const clean = normalizeGroupCategorySlug(category);
  return (
    clean === 'month_born' ||
    clean === 'monthborn' ||
    clean === 'birth_month' ||
    clean === 'birth_months' ||
    clean === 'birthday_group' ||
    clean === 'birthday_groups' ||
    clean === 'month_born_group' ||
    clean === 'month_born_groups' ||
    (clean.includes('month') && (clean.includes('born') || clean.includes('birth')))
  );
}

export type ResolvedChurchGroupItem = ChurchGroup & {
  isAutoBirthMonthVirtual?: boolean;
  birthMonthIndex?: number;
  birthMonthName?: string;
  isAutoDemographicVirtual?: boolean;
  autoDemographicKind?: AutomaticDemographicMinistryKind;
};

export function mergeTwelveMonthBornGroups(
  churchGroups: ChurchGroup[],
  categoryId: ChurchGroupCategory = 'month_born'
): ResolvedChurchGroupItem[] {
  const normalizedTargetCategory = normalizeGroupCategorySlug(categoryId) || 'month_born';
  const usedIds = new Set<string>();

  return ALL_BIRTH_MONTH_GROUPS.map((bg) => {
    const exactMatch = churchGroups.find((g) => {
      if (usedIds.has(g.id)) return false;
      const gCat = normalizeGroupCategorySlug(g.category);
      const sameMonth =
        g.name.trim().toLowerCase() === bg.groupName.toLowerCase() ||
        ((isMonthBornCategory(gCat) || isBirthMonthGroupName(g.name)) &&
          normalizeMonthName(g.name) === bg.monthName);
      return sameMonth && (gCat === normalizedTargetCategory || isMonthBornCategory(gCat));
    });

    const fallbackExactName =
      exactMatch ||
      churchGroups.find(
        (g) => !usedIds.has(g.id) && g.name.trim().toLowerCase() === bg.groupName.toLowerCase()
      );

    if (fallbackExactName) {
      usedIds.add(fallbackExactName.id);
      return {
        ...fallbackExactName,
        category: isMonthBornCategory(fallbackExactName.category)
          ? fallbackExactName.category
          : categoryId,
        isAutoBirthMonthVirtual: false,
        birthMonthIndex: bg.monthIndex,
        birthMonthName: bg.monthName,
      };
    }

    return {
      id: `auto-birth-month-${bg.monthName.toLowerCase()}`,
      name: bg.groupName,
      category: categoryId,
      leaderName: 'Unassigned',
      meetingDay: 'Monthly Fellowship',
      meetingTime: '',
      targetDemographic: `${bg.monthName} Celebrants (Auto-assigned by birthdate)`,
      description: `Automatic month-born group assigned from Date of Birth for members born in ${bg.monthName}.`,
      active: true,
      createdAt: '',
      isAutoBirthMonthVirtual: true,
      birthMonthIndex: bg.monthIndex,
      birthMonthName: bg.monthName,
    };
  });
}

export function expandGroupsWithMonthBorn(
  churchGroups: ChurchGroup[],
  allCategories: ChurchGroupCategoryDefinition[]
): ResolvedChurchGroupItem[] {
  const monthBornCats = allCategories.filter((c) => isMonthBornCategory(c.id));
  if (monthBornCats.length === 0) {
    return churchGroups.map((g) => ({ ...g }));
  }

  const primaryMonthBornCat = monthBornCats[0];
  const monthBornResolved = mergeTwelveMonthBornGroups(churchGroups, primaryMonthBornCat.id);
  const claimedIds = new Set(
    monthBornResolved.filter((g) => !g.isAutoBirthMonthVirtual).map((g) => g.id)
  );

  const otherGroups: ResolvedChurchGroupItem[] = churchGroups
    .filter((g) => !claimedIds.has(g.id))
    .map((g) => ({ ...g }));

  return [...otherGroups, ...monthBornResolved];
}

export function mergeDemographicMinistries(
  churchGroups: ChurchGroup[]
): ResolvedChurchGroupItem[] {
  const usedIds = new Set<string>();

  return ALL_AUTOMATIC_DEMOGRAPHIC_MINISTRIES.map((def) => {
    const preferredMatch = churchGroups.find(
      (g) =>
        !usedIds.has(g.id) &&
        isDepartmentLikeCategory(g.category) &&
        getAutomaticMinistryKind(g.name) === def.kind
    );
    const anyCategoryMatch =
      preferredMatch ||
      churchGroups.find(
        (g) => !usedIds.has(g.id) && getAutomaticMinistryKind(g.name) === def.kind
      );

    if (anyCategoryMatch) {
      usedIds.add(anyCategoryMatch.id);
      return {
        ...anyCategoryMatch,
        isAutoDemographicVirtual: false,
        autoDemographicKind: def.kind,
      };
    }

    return {
      id: `auto-demographic-${def.kind}`,
      name: def.name,
      category: 'ministry',
      leaderName: 'Unassigned',
      meetingDay: 'Scheduled Fellowship',
      meetingTime: '',
      targetDemographic: def.targetDemographic,
      description: def.description,
      active: true,
      createdAt: '',
      isAutoDemographicVirtual: true,
      autoDemographicKind: def.kind,
    };
  });
}

export function expandAllAutomaticChurchGroups(
  churchGroups: ChurchGroup[],
  allCategories: ChurchGroupCategoryDefinition[]
): ResolvedChurchGroupItem[] {
  const withMonthBorn = expandGroupsWithMonthBorn(churchGroups, allCategories);
  const demographicResolved = mergeDemographicMinistries(churchGroups);
  const claimedDemographicIds = new Set(
    demographicResolved.filter((g) => !g.isAutoDemographicVirtual).map((g) => g.id)
  );
  const demographicById = new Map(
    demographicResolved.filter((g) => !g.isAutoDemographicVirtual).map((g) => [g.id, g])
  );

  const mergedBase = withMonthBorn.map((item) => {
    const claimed = claimedDemographicIds.has(item.id) ? demographicById.get(item.id) : undefined;
    return claimed ? { ...item, ...claimed } : item;
  });

  const virtualDemographics = demographicResolved.filter((g) => g.isAutoDemographicVirtual);
  if (virtualDemographics.length === 0) {
    return mergedBase;
  }

  const firstMonthBornIdx = mergedBase.findIndex((g) => isMonthBornCategory(g.category));
  if (firstMonthBornIdx === -1) {
    return [...mergedBase, ...virtualDemographics];
  }

  return [
    ...mergedBase.slice(0, firstMonthBornIdx),
    ...virtualDemographics,
    ...mergedBase.slice(firstMonthBornIdx),
  ];
}

export interface GroupCategoryStyleSet {
  badgeClass: string;
  textClass: string;
  kpiActiveClass: string;
  kpiHoverClass: string;
  kpiLabelClass: string;
  kpiValueClass: string;
  modalCardActiveClass: string;
  modalCheckClass: string;
}

const STYLE_MAP: Record<GroupCategoryColor, GroupCategoryStyleSet> = {
  indigo: {
    badgeClass: 'bg-[#EFEDFF] text-[#6D5CF2] dark:bg-[#2A2A55] dark:text-[#8C7DFF]',
    textClass: 'text-[#6D5CF2] dark:text-[#8C7DFF]',
    kpiActiveClass: 'bg-[#EFEDFF]/60 dark:bg-[#2A2A55]/40 border-[#6D5CF2]',
    kpiHoverClass: 'hover:border-[#6D5CF2]/50',
    kpiLabelClass: 'text-[#6D5CF2] dark:text-[#8C7DFF]',
    kpiValueClass: 'text-[#6D5CF2] dark:text-[#8C7DFF]',
    modalCardActiveClass: 'bg-[#EFEDFF] dark:bg-[#2A2A55] border-[#6D5CF2] text-[#6D5CF2] dark:text-[#8C7DFF]',
    modalCheckClass: 'text-[#6D5CF2]',
  },
  emerald: {
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    kpiActiveClass: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500',
    kpiHoverClass: 'hover:border-emerald-500/50',
    kpiLabelClass: 'text-emerald-700 dark:text-emerald-300',
    kpiValueClass: 'text-emerald-600 dark:text-emerald-400',
    modalCardActiveClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200',
    modalCheckClass: 'text-emerald-600',
  },
  sky: {
    badgeClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    textClass: 'text-sky-600 dark:text-sky-400',
    kpiActiveClass: 'bg-sky-50 dark:bg-sky-950/30 border-sky-400',
    kpiHoverClass: 'hover:border-sky-400/50',
    kpiLabelClass: 'text-sky-700 dark:text-sky-300',
    kpiValueClass: 'text-sky-600 dark:text-sky-400',
    modalCardActiveClass: 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-900 dark:text-sky-200',
    modalCheckClass: 'text-sky-600',
  },
  violet: {
    badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
    textClass: 'text-violet-600 dark:text-violet-400',
    kpiActiveClass: 'bg-violet-50 dark:bg-violet-950/30 border-violet-500',
    kpiHoverClass: 'hover:border-violet-500/50',
    kpiLabelClass: 'text-violet-700 dark:text-violet-300',
    kpiValueClass: 'text-violet-600 dark:text-violet-400',
    modalCardActiveClass: 'bg-violet-50 dark:bg-violet-950/40 border-violet-500 text-violet-900 dark:text-violet-200',
    modalCheckClass: 'text-violet-600',
  },
  amber: {
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    textClass: 'text-amber-600 dark:text-amber-400',
    kpiActiveClass: 'bg-amber-50 dark:bg-amber-950/30 border-amber-500',
    kpiHoverClass: 'hover:border-amber-500/50',
    kpiLabelClass: 'text-amber-700 dark:text-amber-300',
    kpiValueClass: 'text-amber-600 dark:text-amber-400',
    modalCardActiveClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-900 dark:text-amber-200',
    modalCheckClass: 'text-amber-600',
  },
  rose: {
    badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    textClass: 'text-rose-600 dark:text-rose-400',
    kpiActiveClass: 'bg-rose-50 dark:bg-rose-950/30 border-rose-500',
    kpiHoverClass: 'hover:border-rose-500/50',
    kpiLabelClass: 'text-rose-700 dark:text-rose-300',
    kpiValueClass: 'text-rose-600 dark:text-rose-400',
    modalCardActiveClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 text-rose-900 dark:text-rose-200',
    modalCheckClass: 'text-rose-600',
  },
  teal: {
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
    textClass: 'text-teal-600 dark:text-teal-400',
    kpiActiveClass: 'bg-teal-50 dark:bg-teal-950/30 border-teal-500',
    kpiHoverClass: 'hover:border-teal-500/50',
    kpiLabelClass: 'text-teal-700 dark:text-teal-300',
    kpiValueClass: 'text-teal-600 dark:text-teal-400',
    modalCardActiveClass: 'bg-teal-50 dark:bg-teal-950/40 border-teal-500 text-teal-900 dark:text-teal-200',
    modalCheckClass: 'text-teal-600',
  },
};

export function getGroupCategoryStyles(color?: GroupCategoryColor): GroupCategoryStyleSet {
  return (color && STYLE_MAP[color]) || STYLE_MAP.violet;
}
