import { Person } from '../types/ekklesphere';
import { resolveMemberDepartments } from './memberDepartments';

export const WOMEN_MINISTRY_LABEL = "Women's Ministry";
export const MEN_MINISTRY_LABEL = "Men's Ministry";
export const YOUTH_MINISTRY_LABEL = 'Youth Ministry';
export const YOUTH_MAX_AGE_EXCLUSIVE = 35;

export type AutomaticDemographicMinistryKind = 'women' | 'men' | 'youth';

export interface AutomaticDemographicMinistryDefinition {
  kind: AutomaticDemographicMinistryKind;
  name: string;
  category: 'ministry';
  badgeLabel: string;
  targetDemographic: string;
  description: string;
}

export const ALL_AUTOMATIC_DEMOGRAPHIC_MINISTRIES: readonly AutomaticDemographicMinistryDefinition[] = [
  {
    kind: 'women',
    name: WOMEN_MINISTRY_LABEL,
    category: 'ministry',
    badgeLabel: 'Auto · Female',
    targetDemographic: 'All female members (Auto-assigned by Gender)',
    description:
      "Automatic women's ministry embracing every female member across the congregation.",
  },
  {
    kind: 'men',
    name: MEN_MINISTRY_LABEL,
    category: 'ministry',
    badgeLabel: 'Auto · Male',
    targetDemographic: 'All male members (Auto-assigned by Gender)',
    description:
      "Automatic men's ministry embracing every male member across the congregation.",
  },
  {
    kind: 'youth',
    name: YOUTH_MINISTRY_LABEL,
    category: 'ministry',
    badgeLabel: 'Auto · Under 35',
    targetDemographic: 'All members under age 35 (Auto-assigned by Age)',
    description:
      'Automatic youth ministry connecting every congregation member aged under 35 from Date of Birth.',
  },
] as const;

export interface ResolvedAutomaticMinistryEntry {
  kind: AutomaticDemographicMinistryKind;
  name: string;
  reason: string;
  badgeLabel: string;
}

export interface ResolvedAutomaticMinistriesResult {
  kinds: AutomaticDemographicMinistryKind[];
  names: string[];
  ministries: ResolvedAutomaticMinistryEntry[];
  age: number | null;
}

export function normalizeDemographicLabel(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/\s+/g, ' ');
}

function parseYearMonthDay(dateOfBirth?: string | null): { year: number; month: number; day: number } | null {
  const raw = String(dateOfBirth || '').trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return { year, month, day };
    }
    return null;
  }

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    // Treat DD/MM/YYYY as primary regional format when first > 12 or second <= 12
    const day = first > 12 || second <= 12 ? first : second;
    const month = first > 12 || second <= 12 ? second : first;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return { year, month, day };
    }
  }

  return null;
}

export function computeMemberAge(
  dateOfBirth?: string | null,
  referenceDate: Date = new Date()
): number | null {
  const parts = parseYearMonthDay(dateOfBirth);
  if (!parts) return null;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - parts.year;
  if (refMonth < parts.month || (refMonth === parts.month && refDay < parts.day)) {
    age -= 1;
  }

  if (age < 0 || age > 130) return null;
  return age;
}

export function isYouthUnder35(
  dateOfBirth?: string | null,
  referenceDate: Date = new Date()
): boolean {
  const age = computeMemberAge(dateOfBirth, referenceDate);
  return age !== null && age >= 0 && age < YOUTH_MAX_AGE_EXCLUSIVE;
}

const WOMEN_EXACT_ALIASES = new Set([
  'women',
  "women's",
  'womens',
  "women's ministry",
  'womens ministry',
  'women ministry',
  "women's fellowship",
  'womens fellowship',
  'women fellowship',
  "women's wing",
  'womens wing',
  'women wing',
  "women's department",
  'womens department',
  'women department',
]);

const MEN_EXACT_ALIASES = new Set([
  'men',
  "men's",
  'mens',
  "men's ministry",
  'mens ministry',
  'men ministry',
  "men's fellowship",
  'mens fellowship',
  'men fellowship',
  "men's wing",
  'mens wing',
  'men wing',
  "men's department",
  'mens department',
  'men department',
]);

const YOUTH_EXACT_ALIASES = new Set([
  'youth',
  'youth ministry',
  "youth's ministry",
  'youths ministry',
  'youth fellowship',
  'youth wing',
  'youth department',
  'youth & young adults',
  'youth and young adults',
  'youth church',
]);

export function getAutomaticMinistryKind(
  groupName?: string | null
): AutomaticDemographicMinistryKind | null {
  const clean = normalizeDemographicLabel(groupName).toLowerCase();
  if (!clean) return null;

  // Check explicit exact aliases first, always checking Women before Men
  if (WOMEN_EXACT_ALIASES.has(clean)) return 'women';
  if (MEN_EXACT_ALIASES.has(clean)) return 'men';
  if (YOUTH_EXACT_ALIASES.has(clean)) return 'youth';

  // Pattern match for prefixed/suffixed canonical names like "Women's Ministry (Senior Wing)"
  if (/\bwomen(?:'?s)?\s+(?:ministry|fellowship|wing|department)\b/i.test(clean)) {
    return 'women';
  }
  if (/\bmen(?:'?s)?\s+(?:ministry|fellowship|wing|department)\b/i.test(clean)) {
    return 'men';
  }
  if (/\byouth(?:'?s)?\s+(?:ministry|fellowship|wing|department|&\s*young\s+adults|and\s+young\s+adults)\b/i.test(clean)) {
    return 'youth';
  }

  return null;
}

export function resolveAutomaticDemographicMinistries(
  member?: { gender?: string | null; dateOfBirth?: string | null } | null,
  referenceDate: Date = new Date()
): ResolvedAutomaticMinistriesResult {
  if (!member) {
    return { kinds: [], names: [], ministries: [], age: null };
  }

  const ministries: ResolvedAutomaticMinistryEntry[] = [];
  const genderNorm = normalizeDemographicLabel(member.gender).toLowerCase();

  if (genderNorm === 'female' || genderNorm === 'f' || genderNorm === 'woman') {
    ministries.push({
      kind: 'women',
      name: WOMEN_MINISTRY_LABEL,
      reason: 'Female Member',
      badgeLabel: 'Auto · Female',
    });
  } else if (genderNorm === 'male' || genderNorm === 'm' || genderNorm === 'man') {
    ministries.push({
      kind: 'men',
      name: MEN_MINISTRY_LABEL,
      reason: 'Male Member',
      badgeLabel: 'Auto · Male',
    });
  }

  const age = computeMemberAge(member.dateOfBirth, referenceDate);
  if (age !== null && age >= 0 && age < YOUTH_MAX_AGE_EXCLUSIVE) {
    ministries.push({
      kind: 'youth',
      name: YOUTH_MINISTRY_LABEL,
      reason: `Under 35 (Age ${age})`,
      badgeLabel: `Auto · Age ${age} (<35)`,
    });
  }

  return {
    kinds: ministries.map((m) => m.kind),
    names: ministries.map((m) => m.name),
    ministries,
    age,
  };
}

export function resolveMemberAllDepartmentsAndMinistries(
  member?: Partial<Person> | null,
  referenceDate: Date = new Date()
): {
  explicit: string[];
  automatic: ResolvedAutomaticMinistryEntry[];
  combined: string[];
  age: number | null;
} {
  const explicit = resolveMemberDepartments(member);
  const auto = resolveAutomaticDemographicMinistries(member, referenceDate);

  const seenLower = new Set(explicit.map((d) => normalizeDemographicLabel(d).toLowerCase()));
  const seenKinds = new Set<AutomaticDemographicMinistryKind>();
  for (const dept of explicit) {
    const k = getAutomaticMinistryKind(dept);
    if (k) seenKinds.add(k);
  }

  const combined = [...explicit];
  for (const autoEntry of auto.ministries) {
    const key = autoEntry.name.toLowerCase();
    if (!seenLower.has(key) && !seenKinds.has(autoEntry.kind)) {
      seenLower.add(key);
      seenKinds.add(autoEntry.kind);
      combined.push(autoEntry.name);
    }
  }

  return {
    explicit,
    automatic: auto.ministries,
    combined,
    age: auto.age,
  };
}
