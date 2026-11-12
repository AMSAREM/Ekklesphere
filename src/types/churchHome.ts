// src/types/churchHome.ts
// Multi-tenant domain types for the public church Home / Landing experience.

export interface Theme {
  /** Strong accent color (default warm amber/gold) used for key actions & highlights */
  brand: string;
  /** Deep primary surface used for header, hero, and footer */
  deep: string;
  /** Light page body background */
  bg: string;
  /** Primary body ink color */
  text: string;
  /** Optional dark-mode accent override */
  darkBrand?: string;
  /** Optional dark-mode header/hero/footer surface */
  darkDeep?: string;
  /** Optional dark-mode page body background */
  darkBg?: string;
  /** Optional dark-mode body ink color */
  darkText?: string;
}

export interface ServiceTime {
  id: string;
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  dayOfWeek: number;
  label: string;
  /** 24-hour "HH:MM" start time in church local schedule */
  time: string;
  /** Duration in minutes (used to detect live services) */
  durationMinutes?: number;
  campus?: string;
  description?: string;
  isLivestreamed?: boolean;
}

export interface Ministry {
  id: string;
  name: string;
  category: string;
  summary: string;
  meetingCadence?: string;
  leaderName?: string;
  /** Optional church-uploaded image URL; renders warm gradient fallback when absent */
  imageUrl?: string;
  /** Optional curated CSS gradient fallback for mosaic tiles */
  accentGradient?: string;
  linkHref?: string;
}

export interface ChurchEvent {
  id: string;
  title: string;
  /** ISO-8601 date string */
  dateIso: string;
  endDateIso?: string;
  timeLabel: string;
  location: string;
  category: string;
  summary: string;
  /** Optional church-uploaded image URL */
  imageUrl?: string;
  featured?: boolean;
  registrationHref?: string;
}

export interface NewsPost {
  id: string;
  title: string;
  /** ISO-8601 date string */
  publishedAt: string;
  category: string;
  summary: string;
  author?: string;
  href?: string;
}

export interface SocialLinks {
  youtube?: string;
  facebook?: string;
  instagram?: string;
  whatsapp?: string;
  website?: string;
}

export interface MissionHighlight {
  title: string;
  detail: string;
}

export interface Church {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  missionHeading: string;
  missionStatement: string;
  missionHighlights?: MissionHighlight[];
  logoUrl?: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  mapQuery: string;
  mapUrl: string;
  livestreamUrl?: string;
  timezone: string;
  socialLinks: SocialLinks;
  theme: Theme;
  serviceTimes: ServiceTime[];
  ministries: Ministry[];
  events: ChurchEvent[];
  newsPosts: NewsPost[];
  isPublished: boolean;
}

export type MobileMoneyNetwork = 'mtn_momo' | 'telecel_cash' | 'at_money';

export interface GivingRequest {
  churchId: string;
  churchSlug: string;
  amountGhs: number;
  fund: string;
  network: MobileMoneyNetwork;
  phoneNumber: string;
  donorName?: string;
  note?: string;
}

export interface GivingResult {
  status: 'stub_ready' | 'validation_error';
  reference: string;
  message: string;
  providerLabel: string;
}

export interface CountdownBreakdown {
  nextService: ServiceTime | null;
  targetDateIso: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isLiveNow: boolean;
  formattedDateLabel: string;
}

export type NavSectionKey =
  | 'belong'
  | 'mission'
  | 'prayer'
  | 'worship'
  | 'giving'
  | 'resources';
