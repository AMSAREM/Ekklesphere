// server.ts - Ekklesphere Church Management & Proximity Attendance Server
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { expressOrganizationMiddleware } from './src/middleware/organizationMiddleware.ts';
import { requireUser, requireRoles, signToken, verifyToken } from './lib/auth.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const LIVE_STATE_PATH = path.join(__dirname, '.live_campus_state.json');
const PRIMARY_CAMPUS_SITE_ID = '00000000-0000-0000-0000-000000000001';
const PRIMARY_ORGANIZATION_ID = 'e0000000-0000-0000-0000-000000000001';

// Optional Supabase client: only initialized if both URL and Key are present
// Never crashes the application if absent in production
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

interface StoredEvent {
  id: string;
  organization_id: string;
  client_event_id: string;
  user_id: string;
  person_id?: string;
  person_name?: string;
  site_id: string;
  type: 'enter' | 'exit' | 'manual_in' | 'manual_out';
  source: 'geofence' | 'manual' | 'web' | 'admin_edit';
  platform: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null;
  is_mock: boolean;
  device_time: string;
  server_time: string;
  status: 'accepted' | 'flagged' | 'rejected';
  flag_reasons: string[];
}

interface RegisteredSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

interface PremiseSettings {
  churchName: string;
  campusName: string;
  campusAddress: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  innerGeofenceMeters: number;
  outerGeofenceMeters: number;
  dwellTimeMinutes: number;
  updatedAt: string | null;
  updatedBy?: string;
}

interface LiveCheckinRecord {
  id: string;
  tenantId: string;
  personId: string;
  personName?: string;
  serviceInstanceId: string;
  campusId: string;
  method: 'usher' | 'posted_qr' | 'beacon' | 'geofence' | 'email_link' | 'manual';
  confidence: number;
  checkedInAt: string;
  departedAt?: string;
  late: boolean;
  recordedBy?: string;
  note?: string;
  distanceM?: number | null;
  lat?: number | null;
  lng?: number | null;
}

interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  personId?: string;
  personName?: string;
  userAgent?: string;
  subscribedAt: string;
  tenantId?: string;
}

interface PersistedLiveState {
  premiseSettings: PremiseSettings | null;
  registeredSites: RegisteredSite[];
  liveCheckins: LiveCheckinRecord[];
  inMemoryEvents: StoredEvent[];
  inMemoryMembers?: Record<string, any>[];
  inMemoryEventsList?: Record<string, any>[];
  pushSubscriptions?: PushSubscriptionRecord[];
}

let premiseSettings: PremiseSettings | null = null;
let registeredSites: RegisteredSite[] = [];
let liveCheckins: LiveCheckinRecord[] = [];
let inMemoryEvents: StoredEvent[] = [];
let inMemoryMembers: Record<string, any>[] = [];
let inMemoryEventsList: Record<string, any>[] = [];
let pushSubscriptions: PushSubscriptionRecord[] = [];

function loadLiveState(): void {
  try {
    if (fs.existsSync(LIVE_STATE_PATH)) {
      const raw = fs.readFileSync(LIVE_STATE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedLiveState>;
      if (parsed.premiseSettings) premiseSettings = parsed.premiseSettings;
      if (Array.isArray(parsed.registeredSites)) registeredSites = parsed.registeredSites;
      if (Array.isArray(parsed.liveCheckins)) liveCheckins = parsed.liveCheckins;
      if (Array.isArray(parsed.inMemoryEvents)) inMemoryEvents = parsed.inMemoryEvents;
      if (Array.isArray(parsed.inMemoryMembers)) inMemoryMembers = parsed.inMemoryMembers;
      if (Array.isArray(parsed.inMemoryEventsList)) inMemoryEventsList = parsed.inMemoryEventsList;
      if (Array.isArray(parsed.pushSubscriptions)) pushSubscriptions = parsed.pushSubscriptions;
    }
  } catch (err) {
    console.warn('[Ekklesphere] Could not read .live_campus_state.json, starting clean:', err);
  }
}

function saveLiveState(): void {
  try {
    const state: PersistedLiveState = {
      premiseSettings,
      registeredSites,
      liveCheckins,
      inMemoryEvents: inMemoryEvents.slice(0, 250),
      inMemoryMembers: inMemoryMembers.slice(0, 1000),
      inMemoryEventsList: inMemoryEventsList.slice(0, 100),
      pushSubscriptions: pushSubscriptions.slice(0, 500),
    };
    fs.writeFileSync(LIVE_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Ekklesphere] Could not persist .live_campus_state.json:', err);
  }
}

loadLiveState();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(expressOrganizationMiddleware);

// Rate limiter for attendance signals
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many attendance submissions. Please wait.' },
});

// Haversine formula for server-side distance verification in meters
function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toValidUuid(id: string): string {
  if (uuidRegex.test(id)) return id.toLowerCase();
  const hex = createHash('sha256').update(`ekklesphere:${id}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const EventSchema = z.object({
  clientEventId: z.string().regex(uuidRegex, 'Invalid UUID'),
  siteId: z.string().regex(uuidRegex, 'Invalid UUID').default(PRIMARY_CAMPUS_SITE_ID),
  organizationId: z.string().regex(uuidRegex, 'Invalid UUID').optional(),
  personId: z.string().min(1).max(128).optional(),
  personName: z.string().min(1).max(160).optional(),
  serviceInstanceId: z.string().min(1).max(128).optional(),
  type: z.enum(['enter', 'exit', 'manual_in', 'manual_out']),
  source: z.enum(['geofence', 'manual', 'web']),
  platform: z.enum(['android', 'web', 'ios']).default('web'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nonnegative().nullable(),
  isMock: z.boolean().default(false),
  deviceTime: z.string().datetime(),
});

const PremiseConfigSchema = z.object({
  churchName: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'PIWC KWADASO'),
    z.string().max(300).default('PIWC KWADASO')
  ),
  campusName: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'PIWC KWADASO'),
    z.string().max(300).default('PIWC KWADASO')
  ),
  campusAddress: z.preprocess(
    (val) => (typeof val === 'string' ? val.trim() : ''),
    z.string().max(500).default('')
  ),
  lat: z.preprocess((val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, z.number().min(-90).max(90)),
  lng: z.preprocess((val) => {
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? num : NaN;
  }, z.number().min(-180).max(180)),
  accuracyM: z.preprocess((val) => {
    if (val == null || val === '') return null;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(0, num) : null;
  }, z.number().nullable().default(null)),
  innerGeofenceMeters: z.preprocess((val) => {
    if (val == null || val === '') return 50;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(10, Math.min(5000, Math.round(num))) : 50;
  }, z.number().default(50)),
  outerGeofenceMeters: z.preprocess((val) => {
    if (val == null || val === '') return 300;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(25, Math.min(10000, Math.round(num))) : 300;
  }, z.number().default(300)),
  dwellTimeMinutes: z.preprocess((val) => {
    if (val == null || val === '') return 5;
    const num = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(num) ? Math.max(1, Math.min(120, Math.round(num))) : 5;
  }, z.number().default(5)),
  updatedBy: z.preprocess(
    (val) => (typeof val === 'string' && val.trim().length > 0 ? val.trim() : 'Administrator'),
    z.string().max(200).default('Administrator')
  ),
});

const MAX_ACCURACY_M = 100;

// =========================================================================
// CHURCH PREMISE GPS GEOFENCE CONFIGURATION ENDPOINTS
// =========================================================================

app.get(['/campus-premise', '/api/campus-premise'], (_req: Request, res: Response) => {
  const isConfigured =
    premiseSettings !== null &&
    typeof premiseSettings.lat === 'number' &&
    typeof premiseSettings.lng === 'number' &&
    Number.isFinite(premiseSettings.lat) &&
    Number.isFinite(premiseSettings.lng);

  return res.status(200).json({
    success: true,
    configured: isConfigured,
    site: registeredSites[0] || null,
    premiseSettings,
    liveCheckins,
    totalCheckedIn: liveCheckins.length,
  });
});

app.post(['/campus-premise', '/api/campus-premise'], async (req: Request, res: Response) => {
  const parsed = PremiseConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_premise_coordinates',
      message: 'Valid latitude (-90..90) and longitude (-180..180) are required.',
      details: parsed.error.flatten(),
    });
  }

  const data = parsed.data;
  const nowIso = new Date().toISOString();
  const innerRadius = data.innerGeofenceMeters ?? premiseSettings?.innerGeofenceMeters ?? 50;
  const outerRadius = data.outerGeofenceMeters ?? premiseSettings?.outerGeofenceMeters ?? 300;
  const dwellMinutes = data.dwellTimeMinutes ?? premiseSettings?.dwellTimeMinutes ?? 5;
  const campusName = data.campusName?.trim() || premiseSettings?.campusName || 'PIWC KWADASO';
  const churchName = data.churchName?.trim() || premiseSettings?.churchName || 'PIWC KWADASO';
  const campusAddress = data.campusAddress ?? premiseSettings?.campusAddress ?? '';

  premiseSettings = {
    churchName,
    campusName,
    campusAddress,
    lat: data.lat,
    lng: data.lng,
    accuracyM: data.accuracyM ?? null,
    innerGeofenceMeters: innerRadius,
    outerGeofenceMeters: Math.max(outerRadius, innerRadius),
    dwellTimeMinutes: dwellMinutes,
    updatedAt: nowIso,
    updatedBy: data.updatedBy,
  };

  const primarySite: RegisteredSite = {
    id: PRIMARY_CAMPUS_SITE_ID,
    name: campusName,
    lat: data.lat,
    lng: data.lng,
    radius_m: innerRadius,
  };

  const existingIdx = registeredSites.findIndex((s) => s.id === PRIMARY_CAMPUS_SITE_ID);
  if (existingIdx >= 0) {
    registeredSites[existingIdx] = primarySite;
  } else {
    registeredSites = [primarySite, ...registeredSites];
  }

  // If Supabase is connected, optionally keep sites table in sync without blocking
  if (supabase) {
    try {
      await supabase.from('sites').upsert({
        id: PRIMARY_CAMPUS_SITE_ID,
        name: campusName,
        radius_m: innerRadius,
        location: `SRID=4326;POINT(${data.lng} ${data.lat})`,
        active: true,
      });
    } catch (err) {
      console.warn('[Ekklesphere] Optional Supabase sites sync skipped:', err);
    }
  }

  saveLiveState();

  return res.status(200).json({
    success: true,
    configured: true,
    site: primarySite,
    premiseSettings,
    sites: registeredSites,
  });
});

app.delete(['/campus-premise', '/api/campus-premise'], (_req: Request, res: Response) => {
  registeredSites = [];
  if (premiseSettings) {
    premiseSettings = {
      ...premiseSettings,
      lat: null,
      lng: null,
      accuracyM: null,
      updatedAt: null,
    };
  }
  saveLiveState();

  return res.status(200).json({
    success: true,
    configured: false,
    site: null,
    premiseSettings,
    sites: [],
  });
});

// =========================================================================
// GOOGLE MAPS & WHATSAPP LOCATION LINK RESOLVER FOR CHURCH PREMISES
// =========================================================================

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function isAllowedMapHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'maps.app.goo.gl' ||
    h === 'goo.gl' ||
    h === 'g.co' ||
    h === 'google.com' ||
    h.endsWith('.google.com') ||
    /^www\.google\.[a-z.]+$/.test(h) ||
    /^maps\.google\.[a-z.]+$/.test(h) ||
    h === 'maps.apple.com'
  );
}

function parseDmsPair(text: string): { lat: number; lng: number } | null {
  const dmsRegex =
    /(\d{1,2})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([NSns])[\s,+;/]+(\d{1,3})\s*[°]\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*(?:["″]|'')?\s*([EWew])/;
  const m = text.match(dmsRegex);
  if (!m) return null;
  let lat = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  if (m[4].toUpperCase() === 'S') lat = -lat;
  let lng = Number(m[5]) + Number(m[6]) / 60 + Number(m[7]) / 3600;
  if (m[8].toUpperCase() === 'W') lng = -lng;
  return isValidLatLng(lat, lng) ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } : null;
}

function extractPlaceNameFromUrl(urlStr: string): string | null {
  try {
    const placeMatch = urlStr.match(/\/maps\/place\/([^/@?]+)/i);
    if (!placeMatch) return null;
    const decoded = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    if (!decoded || /^[-?\d.\s°'"NSWE,]+$/i.test(decoded)) return null;
    return decoded.slice(0, 140);
  } catch {
    return null;
  }
}

function extractCoordsFromString(input: string): { lat: number; lng: number; placeName?: string | null } | null {
  let decoded = input;
  try {
    decoded = decodeURIComponent(input.replace(/\+/g, ' '));
  } catch {
    decoded = input;
  }

  const placeName = extractPlaceNameFromUrl(input);

  // Exact Google Maps pin marker (!3d<lat>!4d<lng>)
  const pinMatches = Array.from(decoded.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g));
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  // URL query parameters (q, query, ll, sll, center, destination, daddr, viewpoint)
  try {
    const urlMatch = input.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
      const u = new URL(urlMatch[0]);
      const paramKeys = ['q', 'query', 'll', 'sll', 'center', 'destination', 'daddr', 'viewpoint'];
      for (const key of paramKeys) {
        const val = u.searchParams.get(key);
        if (!val) continue;
        const cleanVal = val.replace(/^loc:/i, '').trim();
        const dmsInParam = parseDmsPair(cleanVal);
        if (dmsInParam) return { ...dmsInParam, placeName };

        const pairMatch = cleanVal.match(/(-?\d{1,2}\.\d+)\s*[,\s]\s*\+?(-?\d{1,3}\.\d+)/);
        if (pairMatch) {
          const lat = Number(pairMatch[1]);
          const lng = Number(pairMatch[2]);
          if (isValidLatLng(lat, lng)) {
            return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
          }
        }
      }
    }
  } catch {
    // Ignore malformed URL
  }

  // /maps/search/<lat>,<lng> or /maps/place/<lat>,<lng>
  const pathCoordMatch = decoded.match(
    /\/maps\/(?:search|place|dir\/[^/]*)\/\s*(-?\d{1,2}\.\d+)\s*,\s*\+?(-?\d{1,3}\.\d+)/i
  );
  if (pathCoordMatch) {
    const lat = Number(pathCoordMatch[1]);
    const lng = Number(pathCoordMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  // DMS format
  const dms = parseDmsPair(decoded);
  if (dms) {
    return { ...dms, placeName };
  }

  // Google Maps viewport /@<lat>,<lng>
  const atMatch = decoded.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  // Decimal coordinate pair (e.g. "5.603717, -0.186964")
  const rawPairMatch = decoded.trim().match(/^\(?\s*(-?\d{1,2}\.\d+)\s*[,/\s]\s*\+?(-?\d{1,3}\.\d+)\s*\)?$/);
  if (rawPairMatch) {
    const lat = Number(rawPairMatch[1]);
    const lng = Number(rawPairMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName: null };
    }
  }

  return null;
}

app.post(['/campus-premise/resolve-link', '/api/campus-premise/resolve-link'], async (req: Request, res: Response) => {
  const rawInput = typeof req.body?.input === 'string' ? req.body.input.trim() : '';
  if (!rawInput || rawInput.length > 2000) {
    return res.status(400).json({
      error: 'invalid_input',
      message: 'Paste a shared Google Maps link or GPS coordinate pair.',
    });
  }

  const direct = extractCoordsFromString(rawInput);
  if (direct) {
    return res.status(200).json({
      success: true,
      lat: direct.lat,
      lng: direct.lng,
      placeName: direct.placeName || null,
      resolvedUrl: rawInput,
    });
  }

  const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return res.status(422).json({
      error: 'coordinates_not_found',
      message: 'Could not find GPS coordinates or a valid Google Maps link in the pasted text.',
    });
  }

  let currentUrl = urlMatch[0];
  try {
    const initialParsed = new URL(currentUrl);
    if (!isAllowedMapHost(initialParsed.hostname)) {
      return res.status(400).json({
        error: 'unsupported_domain',
        message: 'Only Google Maps and Apple Maps shared links are supported.',
      });
    }
  } catch {
    return res.status(400).json({
      error: 'invalid_url',
      message: 'The pasted link is not a valid URL.',
    });
  }

  try {
    for (let hop = 0; hop < 6; hop++) {
      const parsedHop = new URL(currentUrl);
      if (!isAllowedMapHost(parsedHop.hostname)) break;

      if (parsedHop.hostname.includes('consent.google.')) {
        const continueUrl = parsedHop.searchParams.get('continue');
        if (continueUrl) {
          currentUrl = continueUrl;
          const fromConsent = extractCoordsFromString(currentUrl);
          if (fromConsent) {
            return res.status(200).json({
              success: true,
              lat: fromConsent.lat,
              lng: fromConsent.lng,
              placeName: fromConsent.placeName || null,
              resolvedUrl: currentUrl,
            });
          }
          continue;
        }
      }

      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const locationHeader = response.headers.get('location');
      if (locationHeader && response.status >= 300 && response.status < 400) {
        currentUrl = new URL(locationHeader, currentUrl).toString();
        const fromRedirect = extractCoordsFromString(currentUrl);
        if (fromRedirect) {
          return res.status(200).json({
            success: true,
            lat: fromRedirect.lat,
            lng: fromRedirect.lng,
            placeName: fromRedirect.placeName || null,
            resolvedUrl: currentUrl,
          });
        }
        continue;
      }

      const fromFinalUrl = extractCoordsFromString(currentUrl);
      if (fromFinalUrl) {
        return res.status(200).json({
          success: true,
          lat: fromFinalUrl.lat,
          lng: fromFinalUrl.lng,
          placeName: fromFinalUrl.placeName || null,
          resolvedUrl: currentUrl,
        });
      }

      break;
    }

    return res.status(422).json({
      error: 'coordinates_not_found',
      message: 'Could not extract exact coordinates from that link. Please copy coordinate numbers directly.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return res.status(502).json({
      error: 'link_resolution_failed',
      message: `Failed to expand shared link: ${msg}`,
    });
  }
});

// =========================================================================
// LIVE ATTENDANCE CHECK-INS (USHER, QR & AUTO-GEOFENCE)
// =========================================================================

app.get(['/live-checkins', '/api/live-checkins'], (_req: Request, res: Response) => {
  res.status(200).json(liveCheckins);
});

app.post(['/live-checkins', '/api/live-checkins'], (req: Request, res: Response) => {
  const body = req.body || {};
  if (!body.personId || typeof body.personId !== 'string') {
    return res.status(400).json({ error: 'invalid_checkin', message: 'personId is required' });
  }

  const existingIdx = liveCheckins.findIndex((r) => r.personId === body.personId);
  const record: LiveCheckinRecord = {
    id: body.id || `rec-${body.personId}-${Date.now()}`,
    tenantId: body.tenantId || PRIMARY_ORGANIZATION_ID,
    personId: body.personId,
    personName: body.personName,
    serviceInstanceId: body.serviceInstanceId || 'svc-sun-1',
    campusId: PRIMARY_CAMPUS_SITE_ID,
    method: body.method || 'manual',
    confidence: typeof body.confidence === 'number' ? body.confidence : 95,
    checkedInAt:
      body.checkedInAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    late: Boolean(body.late),
    recordedBy: body.recordedBy,
    note: body.note,
    distanceM: body.distanceM ?? null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
  };

  if (existingIdx >= 0) {
    liveCheckins[existingIdx] = record;
  } else {
    liveCheckins.unshift(record);
  }

  saveLiveState();
  return res.status(200).json({ success: true, record, liveCheckins });
});

app.delete(['/live-checkins/:personId', '/api/live-checkins/:personId'], (req: Request, res: Response) => {
  const { personId } = req.params;
  if (personId === '__all__') {
    liveCheckins = [];
  } else {
    liveCheckins = liveCheckins.filter((r) => r.personId !== personId);
  }
  saveLiveState();
  return res.status(200).json({ success: true, liveCheckins });
});

// =========================================================================
// HAVERSINE ATTENDANCE EVENT VERIFICATION
// =========================================================================

async function handleAttendanceEvent(req: Request, res: Response) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const e = parsed.data;
  const userId = e.personId || (req.user ? req.user.id : 'anon');
  const reasons: string[] = [];
  let status: 'accepted' | 'flagged' | 'rejected' = 'accepted';
  let distance: number | null = null;

  const downgrade = (reason: string) => {
    reasons.push(reason);
    if (status === 'accepted') status = 'flagged';
  };

  if (e.isMock) {
    status = 'rejected';
    reasons.push('mock_location');
  }

  const site = registeredSites.find((s) => s.id === e.siteId) || registeredSites[0];
  const siteRadius = site?.radius_m || premiseSettings?.innerGeofenceMeters || 50;

  if (site && e.lat != null && e.lng != null) {
    distance = computeDistanceMeters(e.lat, e.lng, site.lat, site.lng);
    if (distance > siteRadius * 1.5) {
      downgrade(`outside_fence_${distance}m`);
    }
  }

  if (e.accuracyM != null && e.accuracyM > MAX_ACCURACY_M) {
    downgrade(`low_accuracy_${Math.round(e.accuracyM)}m`);
  }

  const now = new Date().toISOString();
  const row: StoredEvent = {
    id: `evt-${Date.now()}`,
    organization_id: e.organizationId || PRIMARY_ORGANIZATION_ID,
    client_event_id: e.clientEventId,
    user_id: userId,
    person_id: e.personId,
    person_name: e.personName,
    site_id: site?.id || e.siteId,
    type: e.type,
    source: e.source,
    platform: e.platform,
    lat: e.lat,
    lng: e.lng,
    accuracy_m: e.accuracyM,
    distance_m: distance,
    is_mock: e.isMock,
    device_time: e.deviceTime,
    server_time: now,
    status,
    flag_reasons: reasons,
  };

  inMemoryEvents.unshift(row);
  saveLiveState();

  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseSettings?.campusName || null,
  });
}

app.post(['/attendance/events', '/api/attendance/events'], attendanceLimiter, handleAttendanceEvent);

app.get(['/attendance/sites', '/api/attendance/sites'], (_req: Request, res: Response) => {
  res.status(200).json(registeredSites);
});

// =========================================================================
// CHURCH WORSHIP SERVICES & EVENTS
// =========================================================================

app.get(['/api/v1/events', '/api/events'], async (_req: Request, res: Response) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }
    } catch {
      // fallback to memory
    }
  }

  if (inMemoryEventsList.length > 0) {
    return res.json(inMemoryEventsList);
  }

  // Default initial church services
  return res.json([
    {
      id: 'svc-sun-1',
      name: 'Sunday First Service (English)',
      starts_at: '07:00',
      ends_at: '09:00',
      status: 'open',
      dwell_min: 5,
    },
    {
      id: 'svc-sun-2',
      name: 'Sunday Second Service (Twi / Multilingual)',
      starts_at: '09:30',
      ends_at: '11:45',
      status: 'scheduled',
      dwell_min: 5,
    },
  ]);
});

app.post(['/api/v1/events', '/api/events'], async (req: Request, res: Response) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Worship Service';
  const rawStartsAt = typeof req.body?.startsAt === 'string' ? req.body.startsAt.trim() : '08:00';
  const rawEndsAt = typeof req.body?.endsAt === 'string' ? req.body.endsAt.trim() : '10:30';
  const dwellMin = Number.isFinite(Number(req.body?.dwellMinutes)) ? Math.max(1, Number(req.body.dwellMinutes)) : 5;

  const newService = {
    id: `svc-${Date.now()}`,
    name,
    starts_at: rawStartsAt,
    ends_at: rawEndsAt,
    dwell_min: dwellMin,
    status: 'open',
    site_id: PRIMARY_CAMPUS_SITE_ID,
  };

  inMemoryEventsList.push(newService);
  saveLiveState();

  if (supabase) {
    try {
      await supabase.from('events').insert({
        name,
        starts_at: rawStartsAt,
        ends_at: rawEndsAt,
        dwell_min: dwellMin,
        status: 'open',
      });
    } catch {
      // ignore
    }
  }

  return res.status(201).json(newService);
});

// =========================================================================
// CONGREGATION MEMBERS DIRECTORY
// =========================================================================

app.get(['/api/v1/members', '/api/members'], async (_req: Request, res: Response) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        return res.json(data);
      }
    } catch {
      // fallback
    }
  }

  return res.json(inMemoryMembers);
});

app.post(['/api/v1/members', '/api/members'], async (req: Request, res: Response) => {
  const body = req.body || {};
  const firstName = String(body.firstName ?? body.first_name ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? '').trim();

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'validation_error', message: 'firstName and lastName are required' });
  }

  const newMember = {
    id: body.id || `m-${Date.now()}`,
    tenantId: PRIMARY_ORGANIZATION_ID,
    firstName,
    lastName,
    phoneE164: body.phoneE164 || body.phoneNumber || null,
    email: body.email || null,
    status: body.status || 'member',
    groupName: body.groupName || 'General Congregation',
    autoCheckinOptedIn: body.autoCheckinOptedIn ?? true,
    avatarInitials: `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase(),
    joinedOn: new Date().toISOString().slice(0, 10),
    consecutiveAbsences: 0,
  };

  inMemoryMembers.unshift(newMember);
  saveLiveState();

  return res.status(201).json(newMember);
});

// =========================================================================
// PUSH NOTIFICATIONS & SUBSCRIBED DEVICES
// =========================================================================

app.post(['/api/notifications/subscribe'], (req: Request, res: Response) => {
  const body = req.body || {};
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const id = typeof body.id === 'string' ? body.id.trim() : `sub-${Date.now()}`;

  if (!endpoint && !id) {
    return res.status(400).json({ error: 'invalid_subscription', message: 'endpoint or id required' });
  }

  const newSub: PushSubscriptionRecord = {
    id,
    endpoint: endpoint || id,
    keys: body.keys,
    personId: body.personId,
    personName: body.personName,
    userAgent: body.userAgent,
    subscribedAt: new Date().toISOString(),
    tenantId: body.tenantId || PRIMARY_ORGANIZATION_ID,
  };

  const existingIdx = pushSubscriptions.findIndex((s) => s.id === id || (endpoint && s.endpoint === endpoint));
  if (existingIdx >= 0) {
    pushSubscriptions[existingIdx] = { ...pushSubscriptions[existingIdx], ...newSub };
  } else {
    pushSubscriptions.unshift(newSub);
  }

  saveLiveState();
  console.log(`[Push Server] Registered push device for ${body.personName || body.personId || 'member'}. Total subscribers: ${pushSubscriptions.length}`);
  return res.status(200).json({ success: true, subscription: newSub, totalSubscribers: pushSubscriptions.length });
});

app.get(['/api/notifications/subscriptions'], (_req: Request, res: Response) => {
  return res.status(200).json({
    subscribersCount: pushSubscriptions.length,
    subscriptions: pushSubscriptions,
  });
});

app.post(['/api/notifications/send'], (req: Request, res: Response) => {
  const { title, body, personId, topic } = req.body || {};
  if (!title || !body) {
    return res.status(400).json({ error: 'invalid_notification', message: 'title and body are required' });
  }

  // Filter subscribers if personId is specified
  const targets = personId
    ? pushSubscriptions.filter((s) => s.personId === personId)
    : pushSubscriptions;

  const count = targets.length > 0 ? targets.length : 1;
  console.log(`[Push Server] Dispatched notification "${title}" to ${count} recipient(s) (topic: ${topic || 'all'})`);

  return res.status(200).json({
    success: true,
    title,
    body,
    dispatchedTo: count,
    topic: topic || 'general',
    timestamp: new Date().toISOString(),
  });
});

app.post(['/api/notifications/test-push'], (req: Request, res: Response) => {
  const memberName = req.body?.personName || 'Church Member';
  const campus = premiseSettings?.campusName || 'PIWC KWADASO';
  const service = inMemoryEventsList[0]?.name || 'Sunday Service';

  const testPayload = {
    title: `Welcome, ${memberName}!`,
    body: `You are checked in for ${service} at ${campus}. Sanctuary presence confirmed.`,
    icon: '/icon.svg',
    tag: 'test-arrival',
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json({
    success: true,
    message: 'Test push payload generated and validated',
    payload: testPayload,
    activeSubscribers: pushSubscriptions.length,
  });
});

// =========================================================================
// SERVER HEALTH & STATUS
// =========================================================================

app.get(['/api/health', '/api/db/status'], (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'healthy',
    app: 'Ekklesphere Church Management',
    premiseConfigured:
      premiseSettings !== null &&
      premiseSettings.lat != null &&
      premiseSettings.lng != null,
    campus: premiseSettings?.campusName || 'PIWC KWADASO',
    churchName: premiseSettings?.churchName || 'PIWC KWADASO',
    timestamp: new Date().toISOString(),
  });
});

// Mount Vite middleware for dev or serve dist in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Ekklesphere] Church Attendance Server running at http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer();
}

export { app };
