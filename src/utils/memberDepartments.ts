export const GENERAL_CONGREGATION_LABEL = 'General Congregation';

function cleanToken(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isGeneralCongregationLabel(value?: string | null): boolean {
  const lower = cleanToken(value).toLowerCase();
  return !lower || lower === 'general congregation' || lower === 'general';
}

/**
 * Parses a single string, comma/semicolon/pipe-delimited string, or string array
 * into a deduplicated array of active department/ministry names.
 * "General Congregation" / "General" are omitted when representing specific assigned wings.
 */
export function parseMemberDepartments(
  input?: string | string[] | null
): string[] {
  const rawTokens: string[] = Array.isArray(input)
    ? input.flatMap((item) => (typeof item === 'string' ? item.split(/[,;|\n]+/) : []))
    : typeof input === 'string'
    ? input.split(/[,;|\n]+/)
    : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of rawTokens) {
    const clean = cleanToken(token);
    if (!clean || isGeneralCongregationLabel(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }

  return result;
}

/**
 * Resolves the canonical list of active departments/ministries for a member record,
 * supporting both the legacy `department` string and multi-value `departments` array.
 */
export function resolveMemberDepartments(member?: {
  department?: string | null;
  departments?: string[] | null;
} | null): string[] {
  if (!member) return [];
  if (Array.isArray(member.departments)) {
    const fromArray = parseMemberDepartments(member.departments);
    if (fromArray.length > 0) return fromArray;
    if (member.departments.length === 0 && isGeneralCongregationLabel(member.department)) {
      return [];
    }
  }
  return parseMemberDepartments(member.department);
}

/**
 * Formats an array (or string) of departments into a canonical display/storage string.
 * Falls back to "General Congregation" when no specific department is selected.
 */
export function formatMemberDepartmentsString(
  input?: string | string[] | null,
  fallback: string = GENERAL_CONGREGATION_LABEL
): string {
  const list = parseMemberDepartments(input);
  if (list.length === 0) return fallback;
  return list.join(', ');
}

/**
 * Synchronizes both `department` (legacy comma-joined string) and `departments` (string[])
 * consistently from partial member input or update payloads.
 */
export function normalizeMemberDepartmentFields(input: {
  department?: string | null;
  departments?: string[] | null;
}): {
  department: string;
  departments: string[];
} {
  const departments =
    input.departments !== undefined
      ? parseMemberDepartments(input.departments)
      : parseMemberDepartments(input.department);
  return {
    departments,
    department:
      departments.length > 0 ? departments.join(', ') : GENERAL_CONGREGATION_LABEL,
  };
}
