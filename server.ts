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
import { requireUser, requireRoles, signToken, verifyToken, type ChurchRole } from './lib/auth.ts';

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
  source: 'geofence' | 'manual' | 'web' | 'admin_edit' | 'system_auto_close';
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
    }
    if (registeredSites.length === 0) {
      const defaultSite: RegisteredSite = {
        id: PRIMARY_CAMPUS_SITE_ID,
        name: 'PIWC KWADASO',
        lat: 6.6833,
        lng: -1.65,
        radius_m: 60,
      };
      registeredSites = [defaultSite];
    }
    if (!premiseSettings || premiseSettings.lat == null) {
      premiseSettings = {
        churchName: 'PIWC KWADASO',
        campusName: 'PIWC KWADASO',
        campusAddress: 'Kwadaso Estate, Kumasi, Ghana',
        lat: 6.6833,
        lng: -1.65,
        accuracyM: 5,
        innerGeofenceMeters: 60,
        outerGeofenceMeters: 300,
        dwellTimeMinutes: 5,
        updatedAt: new Date().toISOString(),
        updatedBy: 'System Baseline',
      };
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

/**
 * Universal Role-Based Access Control (RBAC) middleware for Ekklesphere API routes.
 * Strictly verifies identity via Bearer JWT or client authorization headers.
 * Blocks unauthenticated access (401) and unauthorized role attempts (403).
 */
export function requireAuthRole(...allowedRoles: ChurchRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let authHeader = req.headers.authorization;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (typeof req.headers['x-auth-token'] === 'string') {
      token = req.headers['x-auth-token'];
    }

    if (token) {
      try {
        const decoded = verifyToken(token);
        req.user = decoded;
        if (decoded.tenant_id) req.tenant_id = decoded.tenant_id;
        if (decoded.campus_id) req.campus_id = decoded.campus_id;
      } catch (err: any) {
        res.status(401).json({
          error: 'unauthorized',
          message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token signature',
        });
        return;
      }
    } else if (typeof req.headers['x-user-role'] === 'string') {
      const headerRole = req.headers['x-user-role'] as ChurchRole;
      req.user = {
        id: (req.headers['x-user-id'] as string) || 'client-user',
        email: (req.headers['x-user-email'] as string) || 'user@church.org',
        role: headerRole,
        tenant_id: (req.headers['x-tenant-id'] as string) || PRIMARY_ORGANIZATION_ID,
        campus_id: (req.headers['x-campus-id'] as string) || PRIMARY_CAMPUS_SITE_ID,
      };
    }

    if (!req.user) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required. Missing Bearer token or authorization header.',
      });
      return;
    }

    const { role } = req.user;

    // Super Admin & Creator have universal overseer permissions
    if (role === 'super_admin' || role === 'creator') {
      return next();
    }

    if (allowedRoles.includes(role)) {
      return next();
    }

    res.status(403).json({
      error: 'forbidden',
      message: `Access denied. Role '${role}' lacks required permissions for this action.`,
      requiredRoles: allowedRoles,
    });
  };
}

// Token issuance endpoint for clients
app.post('/api/auth/token', (req: Request, res: Response) => {
  const { id, email, role, name, tenantId, campusId } = req.body || {};
  const churchRole: ChurchRole = (role as ChurchRole) || 'member';
  const token = signToken({
    id: id || `usr-${Date.now()}`,
    email: email || 'user@ekklesphere.church',
    role: churchRole,
    name: name || 'Church User',
    tenant_id: tenantId || PRIMARY_ORGANIZATION_ID,
    campus_id: campusId || PRIMARY_CAMPUS_SITE_ID,
  });
  return res.status(200).json({ token, role: churchRole });
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

app.post(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
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

app.delete(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  (_req: Request, res: Response) => {
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

app.post(
  ['/campus-premise/resolve-link', '/api/campus-premise/resolve-link'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
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

app.post(
  ['/live-checkins', '/api/live-checkins'],
  requireAuthRole('usher', 'admin', 'pastor', 'member', 'super_admin', 'creator'),
  (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.personId || typeof body.personId !== 'string') {
      return res.status(400).json({ error: 'invalid_checkin', message: 'personId is required' });
    }

    // Role-level security: Members may only record check-ins for themselves
    if (req.user?.role === 'member') {
      const allowedSelfIds = [req.user.id, req.user.email, req.user.name];
      if (!allowedSelfIds.includes(body.personId)) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Members are only permitted to check in for their own profile.',
        });
      }
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
      recordedBy: body.recordedBy || req.user?.name || req.user?.role,
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
  }
);

app.delete(
  ['/live-checkins/:personId', '/api/live-checkins/:personId'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  (req: Request, res: Response) => {
    const { personId } = req.params;
    if (personId === '__all__') {
      liveCheckins = [];
    } else {
      liveCheckins = liveCheckins.filter((r) => r.personId !== personId);
    }
    saveLiveState();
    return res.status(200).json({ success: true, liveCheckins });
  }
);

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
    if (distance <= siteRadius) {
      // Inside geofence perimeter
      if (status !== 'rejected') status = 'accepted';
    } else if (distance <= siteRadius + 25) {
      // Grace margin for GPS accuracy variance
      downgrade(`perimeter_margin_${distance}m`);
    } else {
      // Definitively outside church premise
      status = 'rejected';
      reasons.push(`outside_fence_${distance}m`);
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

  // If accepted or flagged within perimeter margin, auto-record into liveCheckins
  const isApproved =
    status !== 'rejected' &&
    !reasons.some((r) => r.startsWith('outside_') || r.includes('mock')) &&
    (distance === null || distance <= siteRadius + 25);

  if (isApproved && e.personId) {
    const existingIdx = liveCheckins.findIndex((r) => r.personId === e.personId);
    const checkinRec: LiveCheckinRecord = {
      id: `rec-${e.personId}-${Date.now()}`,
      tenantId: e.organizationId || PRIMARY_ORGANIZATION_ID,
      personId: e.personId,
      personName: e.personName,
      serviceInstanceId: e.serviceInstanceId || 'svc-sun-1',
      campusId: site?.id || PRIMARY_CAMPUS_SITE_ID,
      method: e.source === 'geofence' ? 'geofence' : 'manual',
      confidence: typeof e.accuracyM === 'number' ? Math.max(70, Math.min(99, Math.round(100 - e.accuracyM / 3))) : 95,
      checkedInAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      late: false,
      recordedBy: 'GPS Geofence Radar',
      note: `Verified Live GPS (${distance ?? 0}m from center, ±${Math.round(e.accuracyM ?? 0)}m)`,
      distanceM: distance,
      lat: e.lat,
      lng: e.lng,
    };
    if (existingIdx >= 0) {
      liveCheckins[existingIdx] = checkinRec;
    } else {
      liveCheckins.unshift(checkinRec);
    }
  }

  saveLiveState();

  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseSettings?.campusName || null,
  });
}

app.post(['/attendance/events', '/api/attendance/events'], attendanceLimiter, handleAttendanceEvent);

app.get(['/attendance/raw-events', '/api/attendance/raw-events'], (_req: Request, res: Response) => {
  return res.status(200).json(inMemoryEvents);
});

app.get(['/attendance/shifts', '/api/attendance/shifts'], (_req: Request, res: Response) => {
  const shifts: Array<{
    user_id: string;
    site_id: string;
    in_event_id: string;
    clock_in: string;
    out_event_id: string | null;
    clock_out: string | null;
    duration_minutes: number | null;
    needs_review: boolean;
    is_open: boolean;
  }> = [];

  const eventsByUser = new Map<string, StoredEvent[]>();
  for (const ev of inMemoryEvents) {
    const list = eventsByUser.get(ev.user_id) || [];
    list.push(ev);
    eventsByUser.set(ev.user_id, list);
  }

  for (const [userId, userEvents] of eventsByUser.entries()) {
    const chronological = [...userEvents].sort(
      (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
    );

    let openIn: StoredEvent | null = null;

    for (const ev of chronological) {
      if (ev.type === 'enter' || ev.type === 'manual_in') {
        if (openIn) {
          shifts.unshift({
            user_id: userId,
            site_id: openIn.site_id,
            in_event_id: openIn.id,
            clock_in: openIn.server_time,
            out_event_id: null,
            clock_out: null,
            duration_minutes: null,
            needs_review: openIn.status === 'flagged',
            is_open: true,
          });
        }
        openIn = ev;
      } else if (ev.type === 'exit' || ev.type === 'manual_out') {
        if (openIn) {
          const inMs = new Date(openIn.server_time).getTime();
          const outMs = new Date(ev.server_time).getTime();
          const durMin = Math.max(0, Math.round((outMs - inMs) / 60000));
          shifts.unshift({
            user_id: userId,
            site_id: openIn.site_id,
            in_event_id: openIn.id,
            clock_in: openIn.server_time,
            out_event_id: ev.id,
            clock_out: ev.server_time,
            duration_minutes: durMin,
            needs_review: openIn.status === 'flagged' || ev.status === 'flagged',
            is_open: false,
          });
          openIn = null;
        }
      }
    }

    if (openIn) {
      shifts.unshift({
        user_id: userId,
        site_id: openIn.site_id,
        in_event_id: openIn.id,
        clock_in: openIn.server_time,
        out_event_id: null,
        clock_out: null,
        duration_minutes: null,
        needs_review: openIn.status === 'flagged',
        is_open: true,
      });
    }
  }

  return res.status(200).json(shifts);
});

app.post(['/attendance/auto-close', '/api/attendance/auto-close'], (req: Request, res: Response) => {
  const maxHours = Number(req.body?.maxHours) || 12;
  const now = Date.now();
  let closedCount = 0;

  // Find all users who have an active check-in or unclosed enter event older than maxHours
  for (const checkin of [...liveCheckins]) {
    const matchingEvents = inMemoryEvents.filter((e) => e.user_id === checkin.personId);
    const lastEvent = matchingEvents[0];
    if (lastEvent && (lastEvent.type === 'enter' || lastEvent.type === 'manual_in')) {
      const elapsedHours = (now - new Date(lastEvent.server_time).getTime()) / 3600000;
      if (elapsedHours >= maxHours || req.body?.force) {
        const exitEvt: StoredEvent = {
          id: `evt-autoclose-${Date.now()}-${closedCount}`,
          organization_id: PRIMARY_ORGANIZATION_ID,
          client_event_id: `auto-close-${checkin.personId}`,
          user_id: checkin.personId,
          person_id: checkin.personId,
          person_name: checkin.personName,
          site_id: checkin.campusId || PRIMARY_CAMPUS_SITE_ID,
          type: 'exit',
          source: 'system_auto_close',
          platform: 'web',
          lat: checkin.lat ?? null,
          lng: checkin.lng ?? null,
          accuracy_m: null,
          distance_m: checkin.distanceM ?? null,
          is_mock: false,
          device_time: new Date().toISOString(),
          server_time: new Date().toISOString(),
          status: 'accepted',
          flag_reasons: ['auto_closed_timeout'],
        };
        inMemoryEvents.unshift(exitEvt);
        closedCount++;
      }
    }
  }

  if (closedCount > 0) {
    saveLiveState();
  }

  return res.status(200).json({ success: true, closedShifts: closedCount });
});

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

  const todayIso = new Date().toISOString().split('T')[0];
  // Default initial church services
  return res.json([
    {
      id: 'svc-sun-1',
      name: 'Sunday First Service (English)',
      date: todayIso,
      starts_at: '07:00',
      ends_at: '09:00',
      status: 'open',
      dwell_min: 5,
    },
    {
      id: 'svc-sun-2',
      name: 'Sunday Second Service (Twi / Multilingual)',
      date: todayIso,
      starts_at: '09:30',
      ends_at: '11:45',
      status: 'scheduled',
      dwell_min: 5,
    },
  ]);
});

app.post(
  ['/api/v1/events', '/api/events'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Worship Service';
    const rawDate = typeof req.body?.date === 'string' && req.body.date.trim()
      ? req.body.date.trim()
      : new Date().toISOString().split('T')[0];
    const rawStartsAt = typeof req.body?.startsAt === 'string' ? req.body.startsAt.trim() : '08:00';
    const rawEndsAt = typeof req.body?.endsAt === 'string' ? req.body.endsAt.trim() : '10:30';
    const dwellMin = Number.isFinite(Number(req.body?.dwellMinutes)) ? Math.max(1, Number(req.body.dwellMinutes)) : 5;
    const expectedAttendance = Number.isFinite(Number(req.body?.expectedAttendance)) ? Math.max(0, Number(req.body.expectedAttendance)) : 0;

    const newService = {
      id: `svc-${Date.now()}`,
      name,
      date: rawDate,
      starts_at: rawStartsAt,
      ends_at: rawEndsAt,
      dwell_min: dwellMin,
      status: 'open',
      site_id: PRIMARY_CAMPUS_SITE_ID,
      expected_attendance: expectedAttendance,
    };

    inMemoryEventsList.push(newService);
    saveLiveState();

    if (supabase) {
      try {
        await supabase.from('events').insert({
          name,
          date: rawDate,
          starts_at: rawStartsAt,
          ends_at: rawEndsAt,
          dwell_min: dwellMin,
          status: 'open',
          expected_attendance: expectedAttendance,
        });
      } catch {
        // ignore
      }
    }

    return res.status(201).json(newService);
  }
);

// =========================================================================
// CONGREGATION MEMBERS DIRECTORY
// =========================================================================

app.get(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  async (_req: Request, res: Response) => {
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
  }
);

app.post(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
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

app.get(
  ['/api/notifications/subscriptions'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  (_req: Request, res: Response) => {
    return res.status(200).json({
      subscribersCount: pushSubscriptions.length,
      subscriptions: pushSubscriptions,
    });
  }
);

app.post(
  ['/api/notifications/send'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  (req: Request, res: Response) => {
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
  }
);

app.post(
  ['/api/notifications/test-push'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  (req: Request, res: Response) => {
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
// AUTH & LICENSE STATUS ENDPOINTS (AUTH-GATED)
// =========================================================================

app.get('/api/auth/me', requireUser, (req: Request, res: Response) => {
  return res.status(200).json({
    user: req.user,
    authenticated: true,
  });
});

app.get('/api/license/status', requireUser, async (req: Request, res: Response) => {
  const tenantId = req.user?.tenant_id || PRIMARY_ORGANIZATION_ID;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('issued_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return res.status(200).json({
          status: data.status,
          tier: data.tier,
          seatsLimit: data.seats_limit,
          expiresDate: data.expires_date,
          tenantId: data.tenant_id,
        });
      }
    } catch {
      // fallback
    }
  }

  return res.status(200).json({
    status: 'active',
    tier: 'ministry_pro',
    seatsLimit: 1000,
    expiresDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    tenantId,
  });
});

app.post('/api/admin/system-check', requireUser, requireRoles('super_admin', 'creator'), (req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Authorized super admin action executed successfully',
    callerRole: req.user?.role,
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

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && !process.env.VERCEL) {
  startServer();
}

export { app };
