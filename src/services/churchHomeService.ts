// src/services/churchHomeService.ts
// Supabase read-only public church loader (no Firebase), countdown calculator,
// runtime CSS theme builder, MoMo phone validation, and single startGiving() stub.

import { DEMO_CHURCH_HOME, DEMO_CHURCH_REGISTRY } from '../data/demoChurchHome';
import { isSupabaseBrowserConfigured, supabaseBrowserClient } from '../lib/supabase';
import type {
  Church,
  ChurchEvent,
  CountdownBreakdown,
  GivingRequest,
  GivingResult,
  Ministry,
  MobileMoneyNetwork,
  NewsPost,
  ServiceTime,
  Theme,
} from '../types/churchHome';

const DEFAULT_SLUG =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string> }).env?.VITE_DEFAULT_CHURCH_SLUG?.trim()) ||
  '';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function mergeTheme(rawTheme: unknown): Theme {
  const base = DEMO_CHURCH_HOME.theme;
  if (!rawTheme || typeof rawTheme !== 'object') return base;
  const candidate = rawTheme as Partial<Theme>;
  return {
    brand: candidate.brand || base.brand,
    deep: candidate.deep || base.deep,
    bg: candidate.bg || base.bg,
    text: candidate.text || base.text,
    darkBrand: candidate.darkBrand || candidate.brand || base.darkBrand,
    darkDeep: candidate.darkDeep || base.darkDeep,
    darkBg: candidate.darkBg || base.darkBg,
    darkText: candidate.darkText || base.darkText,
  };
}

/**
 * Resolve the requested church slug from URL query (`?church=slug`) or env default.
 */
export function resolveRequestedChurchSlug(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('church')?.trim().toLowerCase();
    if (fromQuery) return fromQuery;
  }
  return DEFAULT_SLUG;
}

/**
 * Loads published public Home content strictly from Supabase (`supabaseBrowserClient`).
 * Returns neutral empty-state template if Supabase is unconfigured or no church is published yet.
 */
export async function loadPublicChurchHome(
  requestedSlug?: string
): Promise<{ church: Church; source: 'supabase' | 'demo' }> {
  const slug = (requestedSlug !== undefined ? requestedSlug : resolveRequestedChurchSlug()).toLowerCase();
  const demoFallback = (slug && DEMO_CHURCH_REGISTRY[slug]) || DEMO_CHURCH_HOME;

  if (!isSupabaseBrowserConfigured || !supabaseBrowserClient) {
    return { church: demoFallback, source: 'demo' };
  }

  try {
    // 1. Lookup published church public profile joined with organization metadata
    let orgQuery = supabaseBrowserClient
      .from('organizations')
      .select(
        `
        id,
        name,
        slug,
        timezone,
        logo_url,
        website,
        phone,
        email,
        church_public_profiles (
          short_name,
          tagline,
          hero_headline,
          hero_subheadline,
          mission_heading,
          mission_statement,
          mission_highlights,
          address,
          city,
          phone,
          email,
          map_query,
          map_url,
          livestream_url,
          social_links,
          theme,
          is_published
        )
      `
      );

    if (slug) {
      orgQuery = orgQuery.eq('slug', slug);
    } else {
      orgQuery = orgQuery.order('created_at', { ascending: true }).limit(1);
    }

    const { data: orgRow, error: orgErr } = await orgQuery.maybeSingle();

    if (orgErr || !orgRow) {
      return { church: demoFallback, source: 'demo' };
    }

    const profileRaw = Array.isArray(orgRow.church_public_profiles)
      ? orgRow.church_public_profiles[0]
      : orgRow.church_public_profiles;

    if (!profileRaw || profileRaw.is_published !== true) {
      return { church: demoFallback, source: 'demo' };
    }

    const orgId = String(orgRow.id);

    // 2. Fetch child published public collections in parallel
    const [svcRes, minRes, evtRes, newsRes] = await Promise.all([
      supabaseBrowserClient
        .from('service_times')
        .select('id, day_of_week, label, start_time, duration_minutes, campus, description, is_livestreamed')
        .eq('organization_id', orgId)
        .eq('is_published', true)
        .order('sort_order', { ascending: true }),
      supabaseBrowserClient
        .from('ministries')
        .select('id, name, category, summary, meeting_cadence, leader_name, image_url, accent_gradient, link_href')
        .eq('organization_id', orgId)
        .eq('is_published', true)
        .order('sort_order', { ascending: true }),
      supabaseBrowserClient
        .from('church_events')
        .select('id, title, starts_at, ends_at, time_label, location, category, summary, image_url, is_featured, registration_href')
        .eq('organization_id', orgId)
        .eq('is_published', true)
        .order('starts_at', { ascending: true }),
      supabaseBrowserClient
        .from('news_posts')
        .select('id, title, published_at, category, summary, author_name, external_href')
        .eq('organization_id', orgId)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(8),
    ]);

    const serviceTimes: ServiceTime[] =
      !svcRes.error && Array.isArray(svcRes.data) && svcRes.data.length > 0
        ? svcRes.data.map((row) => ({
            id: String(row.id),
            dayOfWeek: Number(row.day_of_week ?? 0),
            label: String(row.label),
            time: String(row.start_time).slice(0, 5),
            durationMinutes: row.duration_minutes ? Number(row.duration_minutes) : 90,
            campus: row.campus ? String(row.campus) : undefined,
            description: row.description ? String(row.description) : undefined,
            isLivestreamed: Boolean(row.is_livestreamed),
          }))
        : demoFallback.serviceTimes;

    const ministries: Ministry[] =
      !minRes.error && Array.isArray(minRes.data) && minRes.data.length > 0
        ? minRes.data.map((row) => ({
            id: String(row.id),
            name: String(row.name),
            category: String(row.category || 'Belong & grow'),
            summary: String(row.summary || ''),
            meetingCadence: row.meeting_cadence ? String(row.meeting_cadence) : undefined,
            leaderName: row.leader_name ? String(row.leader_name) : undefined,
            imageUrl: row.image_url ? String(row.image_url) : undefined,
            accentGradient: row.accent_gradient ? String(row.accent_gradient) : undefined,
            linkHref: row.link_href ? String(row.link_href) : undefined,
          }))
        : demoFallback.ministries;

    const events: ChurchEvent[] =
      !evtRes.error && Array.isArray(evtRes.data) && evtRes.data.length > 0
        ? evtRes.data.map((row) => ({
            id: String(row.id),
            title: String(row.title),
            dateIso: String(row.starts_at),
            endDateIso: row.ends_at ? String(row.ends_at) : undefined,
            timeLabel: String(row.time_label || ''),
            location: String(row.location || ''),
            category: String(row.category || 'Gathering'),
            summary: String(row.summary || ''),
            imageUrl: row.image_url ? String(row.image_url) : undefined,
            featured: Boolean(row.is_featured),
            registrationHref: row.registration_href ? String(row.registration_href) : undefined,
          }))
        : demoFallback.events;

    const newsPosts: NewsPost[] =
      !newsRes.error && Array.isArray(newsRes.data) && newsRes.data.length > 0
        ? newsRes.data.map((row) => ({
            id: String(row.id),
            title: String(row.title),
            publishedAt: String(row.published_at),
            category: String(row.category || 'Updates'),
            summary: String(row.summary || ''),
            author: row.author_name ? String(row.author_name) : undefined,
            href: row.external_href ? String(row.external_href) : undefined,
          }))
        : demoFallback.newsPosts;

    const church: Church = {
      id: orgId,
      slug: String(orgRow.slug),
      name: String(orgRow.name),
      shortName: profileRaw.short_name ? String(profileRaw.short_name) : String(orgRow.name),
      tagline: String(profileRaw.tagline || demoFallback.tagline),
      heroHeadline: String(profileRaw.hero_headline || demoFallback.heroHeadline),
      heroSubheadline: String(profileRaw.hero_subheadline || demoFallback.heroSubheadline),
      missionHeading: String(profileRaw.mission_heading || demoFallback.missionHeading),
      missionStatement: String(profileRaw.mission_statement || demoFallback.missionStatement),
      missionHighlights: Array.isArray(profileRaw.mission_highlights)
        ? profileRaw.mission_highlights
        : demoFallback.missionHighlights,
      logoUrl: orgRow.logo_url ? String(orgRow.logo_url) : undefined,
      address: String(profileRaw.address || demoFallback.address),
      city: String(profileRaw.city || demoFallback.city),
      phone: String(profileRaw.phone || orgRow.phone || demoFallback.phone),
      email: String(profileRaw.email || orgRow.email || demoFallback.email),
      mapQuery: String(profileRaw.map_query || profileRaw.address || demoFallback.mapQuery),
      mapUrl: String(profileRaw.map_url || demoFallback.mapUrl),
      livestreamUrl: profileRaw.livestream_url ? String(profileRaw.livestream_url) : undefined,
      timezone: String(orgRow.timezone || 'Africa/Accra'),
      socialLinks:
        profileRaw.social_links && typeof profileRaw.social_links === 'object'
          ? profileRaw.social_links
          : demoFallback.socialLinks,
      theme: mergeTheme(profileRaw.theme),
      serviceTimes,
      ministries,
      events,
      newsPosts,
      isPublished: true,
    };

    return { church, source: 'supabase' };
  } catch {
    return { church: demoFallback, source: 'demo' };
  }
}

/**
 * Parses "HH:MM" into { hours, minutes }.
 */
function parseTimeHm(hm: string): { hours: number; minutes: number } {
  const [hStr, mStr] = hm.split(':');
  const hours = Math.min(23, Math.max(0, Number.parseInt(hStr || '9', 10) || 0));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(mStr || '0', 10) || 0));
  return { hours, minutes };
}

/**
 * Formats 24-hour "HH:MM" into friendly 12-hour sentence-case time like "7:30 am".
 */
export function formatServiceTimeLabel(hm: string): string {
  const { hours, minutes } = parseTimeHm(hm);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const paddedMin = String(minutes).padStart(2, '0');
  return `${displayHour}:${paddedMin} ${suffix}`;
}

export function getDayName(dayOfWeek: number): string {
  return DAY_NAMES[((dayOfWeek % 7) + 7) % 7];
}

/**
 * Calculates live countdown to the nearest active or upcoming service from `serviceTimes`.
 */
export function computeNextServiceCountdown(
  serviceTimes: ServiceTime[],
  nowInput: Date = new Date()
): CountdownBreakdown {
  if (!serviceTimes || serviceTimes.length === 0) {
    return {
      nextService: null,
      targetDateIso: nowInput.toISOString(),
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isLiveNow: false,
      formattedDateLabel: 'Schedule coming soon',
    };
  }

  const nowMs = nowInput.getTime();
  let bestCandidate: {
    service: ServiceTime;
    startDate: Date;
    diffMs: number;
    isLiveNow: boolean;
  } | null = null;

  for (const service of serviceTimes) {
    const { hours, minutes } = parseTimeHm(service.time);
    const durationMs = (service.durationMinutes ?? 90) * 60 * 1000;

    // Check current day window and up to +7 days ahead
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const candidate = new Date(nowInput);
      candidate.setDate(nowInput.getDate() + dayOffset);
      if (candidate.getDay() !== service.dayOfWeek) continue;

      candidate.setHours(hours, minutes, 0, 0);
      const startMs = candidate.getTime();
      const endMs = startMs + durationMs;

      if (nowMs >= startMs && nowMs < endMs) {
        bestCandidate = {
          service,
          startDate: candidate,
          diffMs: 0,
          isLiveNow: true,
        };
        break;
      }

      if (startMs > nowMs) {
        const diffMs = startMs - nowMs;
        if (!bestCandidate || (!bestCandidate.isLiveNow && diffMs < bestCandidate.diffMs)) {
          bestCandidate = {
            service,
            startDate: candidate,
            diffMs,
            isLiveNow: false,
          };
        }
        break;
      }
    }

    if (bestCandidate?.isLiveNow) break;
  }

  if (!bestCandidate) {
    return {
      nextService: serviceTimes[0],
      targetDateIso: nowInput.toISOString(),
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isLiveNow: false,
      formattedDateLabel: `${getDayName(serviceTimes[0].dayOfWeek)} at ${formatServiceTimeLabel(
        serviceTimes[0].time
      )}`,
    };
  }

  const totalSeconds = Math.max(0, Math.floor(bestCandidate.diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formattedDateLabel = bestCandidate.isLiveNow
    ? `Live now · ${getDayName(bestCandidate.service.dayOfWeek)} ${formatServiceTimeLabel(
        bestCandidate.service.time
      )}`
    : `${getDayName(bestCandidate.service.dayOfWeek)} at ${formatServiceTimeLabel(
        bestCandidate.service.time
      )}`;

  return {
    nextService: bestCandidate.service,
    targetDateIso: bestCandidate.startDate.toISOString(),
    days,
    hours,
    minutes,
    seconds,
    isLiveNow: bestCandidate.isLiveNow,
    formattedDateLabel,
  };
}

/**
 * Validates Ghana local or international E.164 Mobile Money numbers (MTN MoMo, Telecel Cash, AT Money).
 */
export function validateMobileMoneyPhone(rawPhone: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const compact = rawPhone.replace(/[\s()-]/g, '');
  if (!compact) {
    return { valid: false, normalized: '', error: 'Enter a Mobile Money phone number.' };
  }

  let national = '';
  if (compact.startsWith('+233')) {
    national = compact.slice(4);
  } else if (compact.startsWith('233') && compact.length === 12) {
    national = compact.slice(3);
  } else if (compact.startsWith('0') && compact.length === 10) {
    national = compact.slice(1);
  } else {
    return {
      valid: false,
      normalized: '',
      error: 'Use a valid 10-digit Ghana number (for example 024 123 4567 or +233 24 123 4567).',
    };
  }

  if (!/^\d{9}$/.test(national)) {
    return {
      valid: false,
      normalized: '',
      error: 'Phone numbers must contain 9 digits after 0 or +233.',
    };
  }

  const prefix2 = national.slice(0, 2);
  const supportedPrefixes = ['24', '54', '55', '59', '53', '20', '50', '27', '57', '26', '56', '23'];
  if (!supportedPrefixes.includes(prefix2)) {
    return {
      valid: false,
      normalized: '',
      error: 'Prefix does not match an active MTN MoMo, Telecel Cash, or AT Money wallet.',
    };
  }

  return {
    valid: true,
    normalized: `+233${national}`,
  };
}

export const MOBILE_MONEY_NETWORKS: Array<{
  id: MobileMoneyNetwork;
  label: string;
  shortTag: string;
}> = [
  { id: 'mtn_momo', label: 'MTN MoMo', shortTag: 'MTN' },
  { id: 'telecel_cash', label: 'Telecel Cash', shortTag: 'Telecel' },
  { id: 'at_money', label: 'AT Money', shortTag: 'AT' },
];

/**
 * Single giving stub ready to be replaced by Paystack or Hubtel checkout without UI changes.
 * Does NOT process real money or call external payment APIs.
 */
export async function startGiving(request: GivingRequest): Promise<GivingResult> {
  const networkMeta = MOBILE_MONEY_NETWORKS.find((n) => n.id === request.network);
  const providerLabel = networkMeta?.label || 'Mobile Money';

  if (!Number.isFinite(request.amountGhs) || request.amountGhs <= 0) {
    return {
      status: 'validation_error',
      reference: '',
      providerLabel,
      message: 'Please enter a valid amount greater than GHS 0.',
    };
  }

  const phoneCheck = validateMobileMoneyPhone(request.phoneNumber);
  if (!phoneCheck.valid) {
    return {
      status: 'validation_error',
      reference: '',
      providerLabel,
      message: phoneCheck.error || 'Invalid Mobile Money number.',
    };
  }

  // Deterministic preview reference — swap this body with Paystack/Hubtel API call later
  const reference = `GIV-STUB-${Date.now().toString(36).toUpperCase()}`;
  return {
    status: 'stub_ready',
    reference,
    providerLabel,
    message: `Demo confirmation only: GHS ${request.amountGhs.toFixed(
      2
    )} via ${providerLabel} (${phoneCheck.normalized}) for "${request.fund}" is prepared under reference ${reference}. Connect Paystack or Hubtel in startGiving() to charge wallets live.`,
  };
}

/**
 * Builds per-church runtime CSS variables honoring Light and Dark modes.
 */
export function buildThemeCssVariables(theme: Theme, isDark: boolean): Record<string, string> {
  const brand = isDark ? theme.darkBrand || theme.brand : theme.brand;
  const deep = isDark ? theme.darkDeep || theme.deep : theme.deep;
  const bg = isDark ? theme.darkBg || '#0E1714' : theme.bg;
  const text = isDark ? theme.darkText || '#F1F5F2' : theme.text;

  return {
    '--brand': brand,
    '--deep': deep,
    '--bg': bg,
    '--text': text,
    '--brand-ink': '#14110A',
    '--deep-ink': '#F7F5EF',
    '--deep-muted': 'rgba(247, 245, 239, 0.78)',
    '--surface': isDark ? '#15221D' : '#FFFFFF',
    '--surface-muted': isDark ? '#1C2D27' : '#F2EFE8',
    '--text-muted': isDark ? '#B7C5BE' : '#4B5B53',
    '--border': isDark ? 'rgba(241, 245, 242, 0.14)' : 'rgba(22, 34, 29, 0.12)',
  };
}
