import { Person } from '../types/ekklesphere';

export interface PortfolioOption {
  value: string;
  label: string;
  category: 'officer' | 'leader' | 'clergy' | 'congregation';
}

export const CHURCH_PORTFOLIO_OPTIONS: readonly PortfolioOption[] = [
  { value: 'Member', label: 'Member', category: 'congregation' },
  { value: 'Deacon', label: 'Deacon', category: 'officer' },
  { value: 'Deaconess', label: 'Deaconess', category: 'officer' },
  { value: 'Elder', label: 'Elder', category: 'officer' },
  { value: 'Presiding Elder', label: 'Presiding Elder', category: 'officer' },
  { value: 'Pastor', label: 'Pastor', category: 'clergy' },
  { value: 'Senior Pastor', label: 'Senior Pastor', category: 'clergy' },
  { value: 'Associate Pastor', label: 'Associate Pastor', category: 'clergy' },
  { value: 'Youth Pastor', label: 'Youth Pastor', category: 'clergy' },
  { value: 'Evangelist', label: 'Evangelist', category: 'clergy' },
  { value: 'Cell Leader', label: 'Cell Leader', category: 'leader' },
  { value: 'Ministry Leader', label: 'Ministry Leader', category: 'leader' },
  { value: 'Department Head', label: 'Department Head', category: 'leader' },
  { value: 'Usher Captain', label: 'Usher Captain', category: 'leader' },
  { value: 'Choir Director', label: 'Choir Director', category: 'leader' },
  { value: 'Prayer Coordinator', label: 'Prayer Coordinator', category: 'leader' },
  { value: 'Treasurer', label: 'Church Treasurer', category: 'officer' },
  { value: 'Church Secretary', label: 'Church Secretary', category: 'officer' },
  { value: 'Guest', label: 'Guest / Visitor', category: 'congregation' },
] as const;

export const CHURCH_PORTFOLIOS: readonly string[] = CHURCH_PORTFOLIO_OPTIONS.map((p) => p.value);

const PASTORAL_ELIGIBLE_SET = new Set([
  'presiding elder',
  'elder',
  'deacon',
  'deaconess',
  'pastor',
  'senior pastor',
  'associate pastor',
  'youth pastor',
  'evangelist',
  'cell leader',
  'ministry leader',
  'department head',
  'prayer coordinator',
  'usher captain',
]);

const SENIOR_PASTORAL_SET = new Set([
  'senior pastor',
  'presiding elder',
  'pastor',
  'associate pastor',
  'elder',
]);

export function normalizePortfolioLabel(value?: string | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getMemberPortfolio(person?: Partial<Person> | null): string {
  if (!person) return 'Member';
  const raw = normalizePortfolioLabel(person.officerName || person.designation);
  if (raw) return raw;
  return person.status === 'visitor' ? 'Guest' : 'Member';
}

export function isPastoralOfficerOrLeader(person?: Partial<Person> | null): boolean {
  if (!person) return false;
  if (person.status === 'inactive' || person.status === 'transferred' || person.status === 'deceased' || person.status === 'visitor') {
    return false;
  }
  const role = getMemberPortfolio(person).toLowerCase();
  if (PASTORAL_ELIGIBLE_SET.has(role)) return true;
  // Match custom titles containing deacon, elder, pastor, leader, bishop, reverend
  return /\b(deaconess|deacon|elder|pastor|bishop|reverend|rev\.?|evangelist|leader|head|coordinator|overseer)\b/i.test(
    role
  );
}

export function isSeniorPastoralPortfolio(portfolio?: string | null): boolean {
  const clean = normalizePortfolioLabel(portfolio).toLowerCase();
  if (!clean) return false;
  if (SENIOR_PASTORAL_SET.has(clean)) return true;
  return /\b(senior pastor|presiding elder|elder|pastor|bishop|reverend)\b/i.test(clean);
}

/**
 * Oversight access for Pastoral Care Monitor:
 * Administrator, Pastor, Presiding Elder, Associate Pastor (and platform creator/super_admin).
 */
export function isPastoralOversightPortfolio(portfolio?: string | null): boolean {
  const clean = normalizePortfolioLabel(portfolio).toLowerCase();
  if (!clean) return false;
  return /\b(administrator|senior pastor|associate pastor|presiding elder|youth pastor|pastor|bishop|reverend)\b/i.test(
    clean
  );
}

export function canMonitorPastoralCare(
  user?: { role?: string | null; designation?: string | null; title?: string | null; is_creator?: boolean } | null
): boolean {
  if (!user) return false;
  if (user.is_creator) return true;
  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'pastor' || role === 'super_admin' || role === 'creator') {
    return true;
  }
  return (
    isPastoralOversightPortfolio(user.designation) ||
    isPastoralOversightPortfolio(user.title)
  );
}

export function getPortfolioPriorityScore(portfolio?: string | null): number {
  const clean = normalizePortfolioLabel(portfolio).toLowerCase();
  if (clean.includes('senior pastor')) return 100;
  if (clean.includes('presiding elder')) return 95;
  if (clean.includes('pastor')) return 90;
  if (clean.includes('elder')) return 85;
  if (clean.includes('deaconess') || clean.includes('deacon')) return 75;
  if (clean.includes('evangelist') || clean.includes('prayer coordinator')) return 70;
  if (clean.includes('cell leader') || clean.includes('ministry leader') || clean.includes('department head')) {
    return 65;
  }
  if (clean.includes('captain') || clean.includes('treasurer') || clean.includes('secretary')) return 55;
  return 20;
}
