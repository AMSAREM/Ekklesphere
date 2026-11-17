export const BIRTH_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type BirthMonthName = (typeof BIRTH_MONTH_NAMES)[number];

const MONTH_ALIASES: Record<string, BirthMonthName> = {
  jan: 'January',
  january: 'January',
  '1': 'January',
  '01': 'January',
  feb: 'February',
  february: 'February',
  '2': 'February',
  '02': 'February',
  mar: 'March',
  march: 'March',
  '3': 'March',
  '03': 'March',
  apr: 'April',
  april: 'April',
  '4': 'April',
  '04': 'April',
  may: 'May',
  '5': 'May',
  '05': 'May',
  jun: 'June',
  june: 'June',
  '6': 'June',
  '06': 'June',
  jul: 'July',
  july: 'July',
  '7': 'July',
  '07': 'July',
  aug: 'August',
  august: 'August',
  '8': 'August',
  '08': 'August',
  sep: 'September',
  sept: 'September',
  september: 'September',
  '9': 'September',
  '09': 'September',
  oct: 'October',
  october: 'October',
  '10': 'October',
  nov: 'November',
  november: 'November',
  '11': 'November',
  dec: 'December',
  december: 'December',
  '12': 'December',
};

export function normalizeMonthName(raw?: string | null): BirthMonthName | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  let clean = raw.trim().toLowerCase();
  if (!clean) return undefined;

  // Strip common suffixes such as "birthday group", "birthdays", "born group", "month"
  clean = clean
    .replace(/\b(birthday\s*group|birthdays?|born\s*group|month\s*group)\b/gi, '')
    .trim();

  if (MONTH_ALIASES[clean]) {
    return MONTH_ALIASES[clean];
  }

  for (const monthName of BIRTH_MONTH_NAMES) {
    const lower = monthName.toLowerCase();
    if (clean === lower || clean.startsWith(lower.slice(0, 3))) {
      return monthName;
    }
  }

  return undefined;
}

export function extractMonthIndexFromDate(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth || typeof dateOfBirth !== 'string') return null;
  const trimmed = dateOfBirth.trim();
  if (!trimmed) return null;

  // YYYY-MM-DD or ISO timestamp (YYYY-MM-DDTHH:mm:ss...)
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return month - 1;
    }
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return month - 1;
    }
    return null;
  }

  return null;
}

/**
 * Strictly derives canonical Month of Birth from Date of Birth when present,
 * falling back to explicit Month of Birth only if Date of Birth is missing.
 */
export function deriveMonthOfBirth(
  dateOfBirth?: string | null,
  fallbackMonth?: string | null
): BirthMonthName | undefined {
  const idx = extractMonthIndexFromDate(dateOfBirth);
  if (idx !== null && BIRTH_MONTH_NAMES[idx]) {
    return BIRTH_MONTH_NAMES[idx];
  }
  return normalizeMonthName(fallbackMonth);
}

export function formatBirthMonthGroupName(monthOrGroup?: string | null): string | undefined {
  const normalized = normalizeMonthName(monthOrGroup);
  if (!normalized) return undefined;
  return `${normalized} Birthday Group`;
}

export function resolveMemberBirthFields(input: {
  dateOfBirth?: string | null;
  monthOfBirth?: string | null;
  birthMonthGroup?: string | null;
}): {
  monthOfBirth?: BirthMonthName;
  birthMonthGroup?: string;
} {
  const monthFromDob = deriveMonthOfBirth(input.dateOfBirth, undefined);
  const monthOfBirth =
    monthFromDob ||
    normalizeMonthName(input.monthOfBirth) ||
    normalizeMonthName(input.birthMonthGroup);
  const birthMonthGroup = monthOfBirth ? formatBirthMonthGroupName(monthOfBirth) : undefined;
  return {
    monthOfBirth,
    birthMonthGroup,
  };
}

export const ALL_BIRTH_MONTH_GROUPS = BIRTH_MONTH_NAMES.map((monthName, monthIndex) => ({
  monthIndex,
  monthName,
  groupName: `${monthName} Birthday Group`,
}));

export function isBirthMonthGroupName(raw?: string | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return false;
  if (BIRTH_MONTH_NAMES.some((m) => m.toLowerCase() === trimmed)) {
    return true;
  }
  const hasBirthCue = /\b(birthday\s*group|birthdays?|born|birth\s*month)\b/i.test(trimmed);
  return hasBirthCue && Boolean(normalizeMonthName(trimmed));
}
