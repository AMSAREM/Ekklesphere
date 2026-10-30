// server.ts - Full-Stack Express Server with Live Admin Premise Geofence & Attendance Sync
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const LIVE_STATE_PATH = path.join(__dirname, '.live_campus_state.json');
const PRIMARY_CAMPUS_SITE_ID = '00000000-0000-0000-0000-000000000001';

// Initialize Supabase client if keys exist
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

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

interface PersistedLiveState {
  premiseSettings: PremiseSettings | null;
  registeredSites: RegisteredSite[];
  liveCheckins: LiveCheckinRecord[];
  inMemoryEvents: StoredEvent[];
}

let premiseSettings: PremiseSettings | null = null;
let registeredSites: RegisteredSite[] = [];
let liveCheckins: LiveCheckinRecord[] = [];
let inMemoryEvents: StoredEvent[] = [];

function loadLiveState(): void {
  try {
    if (fs.existsSync(LIVE_STATE_PATH)) {
      const raw = fs.readFileSync(LIVE_STATE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedLiveState>;
      if (parsed.premiseSettings) premiseSettings = parsed.premiseSettings;
      if (Array.isArray(parsed.registeredSites)) registeredSites = parsed.registeredSites;
      if (Array.isArray(parsed.liveCheckins)) liveCheckins = parsed.liveCheckins;
      if (Array.isArray(parsed.inMemoryEvents)) inMemoryEvents = parsed.inMemoryEvents;
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

// Rate limit: 60 requests per minute per IP for attendance events
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
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

// Authentication middleware
async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (supabase && token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      (req as any).user = data.user;
      return next();
    }
  }

  const headerUserId = typeof req.headers['x-user-id'] === 'string' ? req.headers['x-user-id'] : null;
  const bodyPersonId = typeof req.body?.personId === 'string' ? req.body.personId : null;

  (req as any).user = {
    id: headerUserId || bodyPersonId || '00000000-0000-0000-0000-000000000001',
    role: 'authenticated',
  };
  next();
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
  platform: z.enum(['android', 'web']).default('web'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nonnegative().nullable(),
  isMock: z.boolean().default(false),
  deviceTime: z.string().datetime(),
});

const PremiseConfigSchema = z.object({
  churchName: z.string().min(1).max(200).optional(),
  campusName: z.string().min(1).max(200).optional(),
  campusAddress: z.string().max(400).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().nullable().optional(),
  innerGeofenceMeters: z.number().min(10).max(2000).optional(),
  outerGeofenceMeters: z.number().min(25).max(5000).optional(),
  dwellTimeMinutes: z.number().min(1).max(60).optional(),
  updatedBy: z.string().max(160).optional(),
});

const MAX_ACCURACY_M = 100;
const MAX_SLACK_M = 25;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_TRAVEL_KMH = 150;

// =========================================================================
// CHURCH PREMISE CONFIGURATION ENDPOINTS (LIVE MULTI-DEVICE SYNC)
// =========================================================================

app.get(['/campus-premise', '/api/campus-premise'], (_req: Request, res: Response) => {
  const primarySite = registeredSites.find((s) => s.id === PRIMARY_CAMPUS_SITE_ID) || registeredSites[0] || null;
  res.status(200).json({
    configured: Boolean(primarySite && premiseSettings?.lat != null && premiseSettings?.lng != null),
    site: primarySite,
    premiseSettings,
    liveCheckins,
    rawEventsCount: inMemoryEvents.length,
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
  const innerRadius = data.innerGeofenceMeters ?? premiseSettings?.innerGeofenceMeters ?? 100;
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
      console.warn('[Ekklesphere] Optional Supabase sites upsert warning:', err);
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
// SHARED GOOGLE MAPS / WHATSAPP LOCATION LINK RESOLVER
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

  // 1. Exact Google Maps pin marker (!3d<lat>!4d<lng>) — prefer last occurrence for exact place pin
  const pinMatches = Array.from(decoded.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g));
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  // 2. URL query parameters (q, query, ll, sll, center, destination, daddr, viewpoint)
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
    // Ignore malformed URL object parsing and continue regex checks
  }

  // 3. /maps/search/<lat>,<lng> or /maps/place/<lat>,<lng> or /maps/dir//<lat>,<lng>
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

  // 4. DMS format (e.g. 5°36'13.4"N 0°11'13.1"W from dropped pin shares)
  const dms = parseDmsPair(decoded);
  if (dms) {
    return { ...dms, placeName };
  }

  // 5. Google Maps viewport /@<lat>,<lng>
  const atMatch = decoded.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

  // 6. Plain decimal coordinate pair (e.g. "5.603717, -0.186964")
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

  // Step 1: Try immediate extraction before any network request
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

  // Step 2: Extract first HTTP/HTTPS URL from shared message (e.g. WhatsApp text + maps.app.goo.gl link)
  const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
  if (!urlMatch) {
    return res.status(422).json({
      error: 'coordinates_not_found',
      message:
        'Could not find GPS coordinates or a valid Google Maps link in the pasted text. Share the location link from Google Maps or WhatsApp.',
    });
  }

  let currentUrl = urlMatch[0];
  try {
    const initialParsed = new URL(currentUrl);
    if (!isAllowedMapHost(initialParsed.hostname)) {
      return res.status(400).json({
        error: 'unsupported_domain',
        message: 'Only Google Maps (maps.app.goo.gl, google.com/maps) and Apple Maps shared links are supported.',
      });
    }
  } catch {
    return res.status(400).json({
      error: 'invalid_url',
      message: 'The pasted link is not a valid URL.',
    });
  }

  try {
    // Follow up to 6 redirects manually to unwrap short links & consent.google.com safely
    let lastResponseHtml = '';
    for (let hop = 0; hop < 6; hop++) {
      const parsedHop = new URL(currentUrl);
      if (!isAllowedMapHost(parsedHop.hostname)) {
        break;
      }

      // Unwrap Google EU consent wrapper immediately if encountered
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
          Cookie: 'CONSENT=YES+cb.20230531-04-p0.en+FX+999; SOCS=CAISHAgCEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg',
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

      // Reached final page: check URL first, then inspect HTML metadata if needed
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

      lastResponseHtml = (await response.text()).slice(0, 450000);
      break;
    }

    if (lastResponseHtml) {
      // Extract optional og:title place name
      const titleMatch = lastResponseHtml.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        lastResponseHtml.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i);
      const rawTitle = titleMatch ? titleMatch[1].replace(/\s*·\s*Google Maps.*$/i, '').replace(/\s*-\s*Google Maps.*$/i, '').trim() : null;
      const cleanPlaceName =
        rawTitle && rawTitle.toLowerCase() !== 'google maps' ? rawTitle.slice(0, 140) : extractPlaceNameFromUrl(currentUrl);

      // Check staticmap preview center=LAT%2CLNG in og:image meta tag
      const staticMapMatch = lastResponseHtml.match(
        /maps\/api\/staticmap\?[^"']*?center=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i
      );
      if (staticMapMatch) {
        const lat = Number(staticMapMatch[1]);
        const lng = Number(staticMapMatch[2]);
        if (isValidLatLng(lat, lng)) {
          return res.status(200).json({
            success: true,
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            placeName: cleanPlaceName || null,
            resolvedUrl: currentUrl,
          });
        }
      }

      // Check !3dLAT!4dLNG or @LAT,LNG embedded in page scripts
      const htmlCoords = extractCoordsFromString(lastResponseHtml);
      if (htmlCoords) {
        return res.status(200).json({
          success: true,
          lat: htmlCoords.lat,
          lng: htmlCoords.lng,
          placeName: cleanPlaceName || htmlCoords.placeName || null,
          resolvedUrl: currentUrl,
        });
      }

      // Check APP_INITIALIZATION_STATE=[[[altitude, longitude, latitude]
      const initMatch = lastResponseHtml.match(
        /APP_INITIALIZATION_STATE=\[\[\[[\d.-]+,(-?\d{1,3}\.\d+),(-?\d{1,2}\.\d+)\]/
      );
      if (initMatch) {
        const lng = Number(initMatch[1]);
        const lat = Number(initMatch[2]);
        if (isValidLatLng(lat, lng)) {
          return res.status(200).json({
            success: true,
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
            placeName: cleanPlaceName || null,
            resolvedUrl: currentUrl,
          });
        }
      }
    }

    return res.status(422).json({
      error: 'coordinates_not_found',
      message:
        'Could not extract exact coordinates from that link. Open the pin in Google Maps, tap Share → Copy Link (or long-press the building to copy coordinates), and paste again.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return res.status(502).json({
      error: 'link_resolution_failed',
      message: `Failed to expand shared Google Maps link: ${msg}`,
    });
  }
});

// =========================================================================
// LIVE CHECK-INS SYNC ENDPOINTS (ADMIN, USHER & MEMBER PORTALS)
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
    tenantId: body.tenantId || 'tenant-live',
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
// POSTGIS / HAVERSINE ATTENDANCE EVENT VERIFICATION ENGINE
// =========================================================================

async function handleAttendanceEvent(req: Request, res: Response) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const e = parsed.data;
  const userId = e.personId || (req as any).user.id;
  const reasons: string[] = [];
  let status: 'accepted' | 'flagged' | 'rejected' = 'accepted';
  let distance: number | null = null;

  const downgrade = (reason: string) => {
    reasons.push(reason);
    if (status === 'accepted') status = 'flagged';
  };

  // Check idempotency (duplicate retry)
  const existingInMemory = inMemoryEvents.find(
    (ev) => ev.user_id === userId && ev.client_event_id === e.clientEventId
  );
  if (existingInMemory) {
    return res.status(200).json(existingInMemory);
  }

  const site = registeredSites.find((s) => s.id === e.siteId) || registeredSites[0] || null;
  if (!site && !supabase) {
    return res.status(400).json({
      error: 'premise_not_configured',
      message: 'Church premise GPS location has not been configured by the Admin yet.',
    });
  }

  // 1. Recompute geometry on the server
  let siteRadius = site ? site.radius_m : premiseSettings?.innerGeofenceMeters || 100;

  if (e.lat == null || e.lng == null) {
    reasons.push('no_location');
    status = 'rejected';
  } else {
    if (supabase) {
      try {
        const { data: dbDist, error } = await supabase
          .rpc('site_distance', { p_site: site?.id || e.siteId, p_lng: e.lng, p_lat: e.lat })
          .single();
        if (!error && dbDist) {
          const resObj = dbDist as { distance_m: number; radius_m: number };
          distance = resObj.distance_m;
          siteRadius = resObj.radius_m;
        }
      } catch (err) {
        console.warn('Supabase site_distance RPC fallback to Haversine:', err);
      }
    }

    if (distance === null && site) {
      distance = computeDistanceMeters(site.lat, site.lng, e.lat, e.lng);
    }

    if (!site && distance === null) {
      return res.status(400).json({
        error: 'premise_not_configured',
        message: 'Church premise GPS location has not been configured by the Admin yet.',
      });
    }

    const slack = Math.min(e.accuracyM ?? 0, MAX_SLACK_M);
    if (distance !== null && distance > siteRadius + slack) {
      reasons.push('outside_site');
      status = 'rejected';
    } else if (distance !== null && distance > siteRadius) {
      downgrade('gps_accuracy_buffer');
    }

    // 2. Impossible travel check
    const previousLocated = inMemoryEvents
      .filter((ev) => ev.user_id === userId && ev.lat !== null && ev.lng !== null && ev.status !== 'rejected')
      .slice(0, 1)[0];

    if (previousLocated && previousLocated.lat !== null && previousLocated.lng !== null) {
      const prevTime = new Date(previousLocated.server_time).getTime();
      const nowTime = Date.now();
      const elapsedMinutes = (nowTime - prevTime) / 60000;

      if (elapsedMinutes > 1) {
        const distKm = computeDistanceMeters(previousLocated.lat, previousLocated.lng, e.lat, e.lng) / 1000;
        const speedKmh = distKm / (elapsedMinutes / 60);
        if (speedKmh > MAX_TRAVEL_KMH) {
          downgrade('impossible_travel');
        }
      }
    }
  }

  // 3. Quality and integrity checks
  if (e.accuracyM != null && e.accuracyM > MAX_ACCURACY_M) downgrade('poor_accuracy');
  if (e.isMock) {
    reasons.push('mock_location');
    status = 'rejected';
  }
  if (Math.abs(Date.now() - new Date(e.deviceTime).getTime()) > MAX_CLOCK_SKEW_MS) {
    downgrade('clock_skew');
  }

  // 4. Construct event row with server timestamp
  const serverTime = new Date().toISOString();
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const orgId = e.organizationId || (req as any).organizationId || 'e0000000-0000-0000-0000-000000000001';

  const row: StoredEvent = {
    id: eventId,
    organization_id: orgId,
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
    server_time: serverTime,
    status,
    flag_reasons: reasons,
  };

  inMemoryEvents.unshift(row);

  // Automatically record verified live check-in so Admin & Usher dashboards see it immediately
  if (e.personId && (e.type === 'enter' || e.type === 'manual_in') && status !== 'rejected') {
    const existingCheckinIdx = liveCheckins.findIndex((r) => r.personId === e.personId);
    const checkinRecord: LiveCheckinRecord = {
      id: `rec-${e.personId}-${Date.now()}`,
      tenantId: orgId,
      personId: e.personId,
      personName: e.personName,
      serviceInstanceId: e.serviceInstanceId || 'svc-sun-1',
      campusId: site?.id || PRIMARY_CAMPUS_SITE_ID,
      method: e.source === 'geofence' ? 'geofence' : 'manual',
      confidence: status === 'accepted' ? 96 : 85,
      checkedInAt: new Date(serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      late: false,
      note: `Live GPS verified (${distance ?? 0}m from ${site?.name || 'premise'}, ±${Math.round(e.accuracyM ?? 0)}m)`,
      distanceM: distance,
      lat: e.lat,
      lng: e.lng,
    };
    if (existingCheckinIdx >= 0) {
      liveCheckins[existingCheckinIdx] = checkinRecord;
    } else {
      liveCheckins.unshift(checkinRecord);
    }
  } else if (e.personId && (e.type === 'exit' || e.type === 'manual_out') && status !== 'rejected') {
    const existingCheckinIdx = liveCheckins.findIndex((r) => r.personId === e.personId);
    if (existingCheckinIdx >= 0) {
      liveCheckins[existingCheckinIdx] = {
        ...liveCheckins[existingCheckinIdx],
        departedAt: new Date(serverTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
    }
  }

  saveLiveState();

  // If Supabase is connected, persist into Supabase
  if (supabase) {
    try {
      const dbRow = {
        client_event_id: e.clientEventId,
        user_id: toValidUuid(userId),
        site_id: site?.id || e.siteId,
        type: e.type,
        source: e.source,
        platform: e.platform,
        location: e.lat != null ? `SRID=4326;POINT(${e.lng} ${e.lat})` : null,
        accuracy_m: e.accuracyM,
        distance_m: distance,
        is_mock: e.isMock,
        device_time: e.deviceTime,
        status,
        flag_reasons: reasons,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('attendance_events')
        .insert(dbRow)
        .select('id, status, flag_reasons, server_time')
        .single();

      if (!insertErr && inserted) {
        row.id = inserted.id;
        row.server_time = inserted.server_time;
      }
    } catch (err) {
      console.warn('Error saving to Supabase attendance_events:', err);
    }
  }

  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseSettings?.campusName || null,
  });
}

// Routes
app.post('/attendance/events', attendanceLimiter, requireUser, handleAttendanceEvent);
app.post('/api/attendance/events', attendanceLimiter, requireUser, handleAttendanceEvent);

// Fetch registered sites
app.get(['/attendance/sites', '/api/attendance/sites'], (_req: Request, res: Response) => {
  res.status(200).json(registeredSites);
});

// Calibrate or register church premise site dynamically
app.post(['/attendance/calibrate-site', '/api/attendance/calibrate-site'], (req: Request, res: Response) => {
  const { name, lat, lng, radius_m } = req.body;
  if (lat == null || lng == null || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'invalid_coordinates', message: 'lat and lng must be valid numbers' });
  }

  const radius = Number(radius_m) || premiseSettings?.innerGeofenceMeters || 100;
  const siteName = name?.trim() || premiseSettings?.campusName || 'Church Premise';
  const nowIso = new Date().toISOString();

  const updatedSite: RegisteredSite = {
    id: PRIMARY_CAMPUS_SITE_ID,
    name: siteName,
    lat,
    lng,
    radius_m: radius,
  };

  const existingIdx = registeredSites.findIndex((s) => s.id === PRIMARY_CAMPUS_SITE_ID);
  if (existingIdx >= 0) {
    registeredSites[existingIdx] = updatedSite;
  } else {
    registeredSites = [updatedSite, ...registeredSites];
  }

  premiseSettings = {
    churchName: premiseSettings?.churchName || 'Ekklesphere Church',
    campusName: siteName,
    campusAddress: premiseSettings?.campusAddress || '',
    lat,
    lng,
    accuracyM: null,
    innerGeofenceMeters: radius,
    outerGeofenceMeters: Math.max(premiseSettings?.outerGeofenceMeters || 300, radius),
    dwellTimeMinutes: premiseSettings?.dwellTimeMinutes || 5,
    updatedAt: nowIso,
  };

  saveLiveState();

  res.status(200).json({
    success: true,
    message: `Church premise set to live GPS (${lat.toFixed(6)}, ${lng.toFixed(6)}) with radius ${radius}m`,
    calibratedSite: updatedSite,
    premiseSettings,
    sites: registeredSites,
  });
});

// Clear configured premise sites (never restores fake hardcoded coordinates)
app.post(['/attendance/reset-sites', '/api/attendance/reset-sites'], (_req: Request, res: Response) => {
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

  res.status(200).json({
    success: true,
    message: 'Church premise GPS location cleared.',
    sites: [],
  });
});

// Fetch raw audit events
app.get(['/attendance/raw-events', '/api/attendance/raw-events'], (_req: Request, res: Response) => {
  res.status(200).json(inMemoryEvents.slice(0, 100));
});

// Calculate shift pairings (implements the 'shifts' view logic per user)
app.get(['/attendance/shifts', '/api/attendance/shifts'], (_req: Request, res: Response) => {
  const validEvents = inMemoryEvents
    .filter((e) => e.status === 'accepted' || e.status === 'flagged')
    .sort((a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime());

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

  const openByUser = new Map<string, any>();

  for (const ev of validEvents) {
    const isEnter = ev.type === 'enter' || ev.type === 'manual_in';
    const isExit = ev.type === 'exit' || ev.type === 'manual_out';
    const key = `${ev.user_id}:${ev.site_id}`;
    const currentShift = openByUser.get(key);

    if (isEnter) {
      if (!currentShift) {
        openByUser.set(key, {
          user_id: ev.user_id,
          site_id: ev.site_id,
          in_event_id: ev.id,
          clock_in: ev.server_time,
          out_event_id: null,
          clock_out: null,
          duration_minutes: null,
          needs_review: ev.status === 'flagged',
          is_open: true,
        });
      }
    } else if (isExit && currentShift) {
      const startMs = new Date(currentShift.clock_in).getTime();
      const endMs = new Date(ev.server_time).getTime();
      currentShift.out_event_id = ev.id;
      currentShift.clock_out = ev.server_time;
      currentShift.duration_minutes = Math.max(0, Math.round((endMs - startMs) / 60000));
      currentShift.needs_review = currentShift.needs_review || ev.status === 'flagged';
      currentShift.is_open = false;

      shifts.push(currentShift);
      openByUser.delete(key);
    }
  }

  for (const openShift of openByUser.values()) {
    shifts.push(openShift);
  }

  res.status(200).json(shifts.reverse());
});

// Auto-close open shifts endpoint
app.post(['/attendance/auto-close', '/api/attendance/auto-close'], (req: Request, res: Response) => {
  const maxHours = req.body?.maxHours || 12;

  let closedCount = 0;
  const sorted = [...inMemoryEvents].sort(
    (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
  );

  let openIn: StoredEvent | null = null;
  for (const ev of sorted) {
    if (ev.status === 'rejected') continue;
    if (ev.type === 'enter' || ev.type === 'manual_in') {
      openIn = ev;
    } else if (ev.type === 'exit' || ev.type === 'manual_out') {
      openIn = null;
    }
  }

  if (openIn) {
    const autoExitTime = new Date(new Date(openIn.server_time).getTime() + maxHours * 3600 * 1000).toISOString();
    inMemoryEvents.unshift({
      id: `evt-autoclose-${Date.now()}`,
      organization_id: openIn.organization_id,
      client_event_id: `auto-${Date.now()}`,
      user_id: openIn.user_id,
      site_id: openIn.site_id,
      type: 'exit',
      source: 'admin_edit',
      platform: 'server',
      lat: openIn.lat,
      lng: openIn.lng,
      accuracy_m: 0,
      distance_m: openIn.distance_m,
      is_mock: false,
      device_time: autoExitTime,
      server_time: autoExitTime,
      status: 'flagged',
      flag_reasons: ['auto_closed'],
    });
    closedCount++;
    saveLiveState();
  }

  res.status(200).json({ success: true, closedShifts: closedCount });
});

// Health & Database connectivity check
app.get(['/api/health', '/api/db/status'], (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geofenceTracking: {
      postgisReady: true,
      supabaseConnected: !!supabase,
      premiseConfigured: Boolean(registeredSites.length > 0 && premiseSettings?.lat != null),
      totalEventsLogged: inMemoryEvents.length,
      liveCheckinsCount: liveCheckins.length,
      sitesMonitored: registeredSites.length,
    },
  });
});

app.get(['/api/v1/organizations', '/api/organizations'], async (_req: Request, res: Response) => {
  if (supabase) {
    const { data, error } = await supabase.from('organizations').select('*');
    if (!error && data && data.length > 0) return res.json(data);
  }
  res.json([
    {
      id: 'e0000000-0000-0000-0000-000000000001',
      name: premiseSettings?.churchName || 'PIWC KWADASO',
      slug: 'primary-church',
      timezone: 'Africa/Accra',
      settings: {
        currency: 'GHS',
        absence_threshold_leader: 2,
        absence_threshold_pastor: 3,
        dwell_min_default: premiseSettings?.dwellTimeMinutes || 5,
      },
    },
  ]);
});

const PRIMARY_ORGANIZATION_ID = 'e0000000-0000-0000-0000-000000000001';

function sanitizeIsoDate(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  return null;
}

function sanitizeNullableText(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeGender(val: unknown): 'male' | 'female' | 'other' | null {
  if (typeof val !== 'string') return null;
  const g = val.trim().toLowerCase();
  if (g === 'male' || g === 'm') return 'male';
  if (g === 'female' || g === 'f') return 'female';
  if (g === 'other') return 'other';
  return null;
}

function mapOfficerToDbRole(
  officerName?: string | null,
  memberStatus?: string | null
): 'owner' | 'admin' | 'pastor' | 'usher' | 'leader' | 'member' | 'guest' {
  if (memberStatus === 'visitor') return 'guest';
  const o = (officerName || '').trim().toLowerCase();
  if (o.includes('pastor')) return 'pastor';
  if (o.includes('usher')) return 'usher';
  if (o.includes('admin')) return 'admin';
  if (o.includes('leader') || o.includes('elder') || o.includes('deacon') || o.includes('head')) {
    return 'leader';
  }
  return 'member';
}

function mapFrontendStatusToDbStatus(
  memberStatus?: string | null
): 'active' | 'inactive' | 'archived' | 'pending' {
  if (memberStatus === 'inactive') return 'inactive';
  if (memberStatus === 'transferred' || memberStatus === 'deceased') return 'archived';
  return 'active';
}

function buildDbMemberPayload(orgId: string, body: Record<string, any>) {
  const firstName = String(body.firstName ?? body.first_name ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? '').trim();
  const middleName = sanitizeNullableText(body.middleName ?? body.middle_name);
  const preferredName = sanitizeNullableText(body.preferredName ?? body.preferred_name);
  const specificLocation = sanitizeNullableText(body.specificLocation ?? body.specific_location);
  const remarks = sanitizeNullableText(body.remarks ?? body.notes);
  const memberIdCode = sanitizeNullableText(body.memberId ?? body.member_id);
  const squads = sanitizeNullableText(body.squads);
  const department = sanitizeNullableText(body.department) || 'General Congregation';
  const officerName = sanitizeNullableText(body.officerName ?? body.member_officer_name) || 'Member';
  const gender = sanitizeGender(body.gender);
  const dateOfBirth = sanitizeIsoDate(body.dateOfBirth ?? body.date_of_birth);
  const phoneE164 = sanitizeNullableText(body.phoneE164 ?? body.phone_e164 ?? body.phoneNumber ?? body.phone_number);
  const phoneNumber = sanitizeNullableText(body.phoneNumber ?? body.phone_number ?? phoneE164);
  const email = sanitizeNullableText(body.email);
  const placeOfResidence = sanitizeNullableText(body.placeOfResidence ?? body.place_of_residence);
  const residentialDigitalAddress = sanitizeNullableText(
    body.residentialDigitalAddress ?? body.residential_digital_address
  );
  const hometown = sanitizeNullableText(body.hometown);
  const occupation = sanitizeNullableText(body.occupation);
  const homeCellGroup =
    sanitizeNullableText(body.homeCellGroup ?? body.home_cell_group ?? body.groupName) || 'General Congregation';
  const monthOfBirth =
    sanitizeNullableText(body.monthOfBirth ?? body.month_of_birth) ||
    (dateOfBirth
      ? new Date(`${dateOfBirth}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
      : null);
  const maritalStatus = sanitizeNullableText(body.maritalStatus ?? body.marital_status) || 'Single';
  const spouseName = maritalStatus === 'Married' ? sanitizeNullableText(body.spouseName ?? body.spouse_name) : null;
  const numberOfChildren = Math.max(0, Number(body.numberOfChildren ?? body.number_of_children ?? 0) || 0);
  const emergencyContactPerson = sanitizeNullableText(
    body.emergencyContactPerson ?? body.emergency_contact_person
  );
  const emergencyPhone = sanitizeNullableText(
    body.emergencyContactPhone ?? body.emergency_phone
  );
  const imageUrl = sanitizeNullableText(body.imageUrl ?? body.image_url ?? body.photo_url);
  const dateOfBaptism = sanitizeIsoDate(body.dateOfBaptism ?? body.date_of_baptism);
  const dateOfMarriage = sanitizeIsoDate(body.dateOfMarriage ?? body.date_of_marriage);
  const dateOfSalvation = sanitizeIsoDate(body.dateOfSalvation ?? body.date_of_salvation);
  const dateOfMembership =
    sanitizeIsoDate(body.dateOfMembership ?? body.date_of_membership ?? body.joinedOn) ||
    new Date().toISOString().slice(0, 10);

  const frontendStatus = sanitizeNullableText(body.status) || 'member';
  const autoCheckinOptedIn =
    typeof body.autoCheckinOptedIn === 'boolean' ? body.autoCheckinOptedIn : true;

  return {
    organization_id: orgId,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    preferred_name: preferredName,
    specific_location: specificLocation,
    remarks,
    member_id: memberIdCode,
    squads,
    department,
    member_officer_name: officerName,
    gender,
    date_of_birth: dateOfBirth,
    phone_e164: phoneE164,
    phone_number: phoneNumber,
    email,
    place_of_residence: placeOfResidence,
    residential_digital_address: residentialDigitalAddress,
    hometown,
    occupation,
    home_cell_group: homeCellGroup,
    month_of_birth: monthOfBirth,
    marital_status: maritalStatus,
    spouse_name: spouseName,
    number_of_children: numberOfChildren,
    emergency_contact_person: emergencyContactPerson,
    emergency_phone: emergencyPhone,
    image_url: imageUrl,
    photo_url: imageUrl,
    date_of_baptism: dateOfBaptism,
    date_of_marriage: dateOfMarriage,
    date_of_salvation: dateOfSalvation,
    date_of_membership: dateOfMembership,
    role: mapOfficerToDbRole(officerName, frontendStatus),
    status: mapFrontendStatusToDbStatus(frontendStatus),
    custom_attributes: {
      memberStatus: frontendStatus,
      autoCheckinOptedIn,
      groupName: sanitizeNullableText(body.groupName) || homeCellGroup,
      consecutiveAbsences: Number(body.consecutiveAbsences ?? 0) || 0,
      notes: sanitizeNullableText(body.notes) || remarks,
    },
  };
}

function mapDbMemberToPerson(row: Record<string, any>) {
  const firstName = row.first_name || 'Member';
  const lastName = row.last_name || '';
  const initials = `${firstName[0] || 'M'}${lastName[0] || 'M'}`.toUpperCase();
  const custom =
    row.custom_attributes && typeof row.custom_attributes === 'object'
      ? (row.custom_attributes as Record<string, any>)
      : {};

  let frontendStatus = custom.memberStatus;
  if (!frontendStatus) {
    if (row.role === 'guest') frontendStatus = 'visitor';
    else if (row.status === 'inactive') frontendStatus = 'inactive';
    else if (row.status === 'archived') frontendStatus = 'transferred';
    else frontendStatus = 'member';
  }

  const joinedOn =
    row.date_of_membership ||
    (typeof row.joined_at === 'string' ? row.joined_at.slice(0, 10) : null) ||
    (typeof row.created_at === 'string' ? row.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));

  const homeCellGroup = row.home_cell_group || custom.groupName || 'General Congregation';

  return {
    id: row.id,
    tenantId: row.organization_id || PRIMARY_ORGANIZATION_ID,
    firstName,
    middleName: row.middle_name || undefined,
    lastName,
    preferredName: row.preferred_name || undefined,
    specificLocation: row.specific_location || undefined,
    remarks: row.remarks || undefined,
    memberId: row.member_id || undefined,
    squads: row.squads || undefined,
    department: row.department || 'General Congregation',
    officerName: row.member_officer_name || 'Member',
    gender: row.gender || undefined,
    dateOfBirth: row.date_of_birth || undefined,
    phoneE164: row.phone_e164 || row.phone_number || '',
    phoneNumber: row.phone_number || row.phone_e164 || undefined,
    placeOfResidence: row.place_of_residence || undefined,
    residentialDigitalAddress: row.residential_digital_address || undefined,
    hometown: row.hometown || undefined,
    occupation: row.occupation || undefined,
    homeCellGroup,
    groupName: custom.groupName || homeCellGroup,
    monthOfBirth: row.month_of_birth || undefined,
    maritalStatus: row.marital_status || 'Single',
    spouseName: row.spouse_name || undefined,
    numberOfChildren: typeof row.number_of_children === 'number' ? row.number_of_children : 0,
    emergencyContactPerson: row.emergency_contact_person || undefined,
    emergencyContactPhone: row.emergency_phone || undefined,
    imageUrl: row.image_url || row.photo_url || undefined,
    dateOfBaptism: row.date_of_baptism || undefined,
    dateOfMarriage: row.date_of_marriage || undefined,
    dateOfSalvation: row.date_of_salvation || undefined,
    dateOfMembership: row.date_of_membership || joinedOn,
    email: row.email || undefined,
    status: frontendStatus,
    autoCheckinOptedIn:
      typeof custom.autoCheckinOptedIn === 'boolean' ? custom.autoCheckinOptedIn : true,
    avatarInitials: initials,
    joinedOn,
    consecutiveAbsences: typeof custom.consecutiveAbsences === 'number' ? custom.consecutiveAbsences : 0,
    notes: custom.notes || row.remarks || undefined,
  };
}

app.get(['/api/v1/members', '/api/members'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  if (!supabase) {
    res.setHeader('X-Supabase-Connected', 'false');
    return res.status(503).json({
      error: 'supabase_not_configured',
      message: 'Supabase database connection is not configured on the server.',
    });
  }

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Ekklesphere] GET /api/members Supabase error:', error);
    return res.status(500).json({
      error: 'db_read_failed',
      message: error.message,
    });
  }

  res.setHeader('X-Supabase-Connected', 'true');
  return res.json((data || []).map(mapDbMemberToPerson));
});

app.post(['/api/v1/members', '/api/members'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  if (!supabase) {
    return res.status(503).json({
      error: 'supabase_not_configured',
      message: 'Supabase database connection is not configured on the server.',
    });
  }

  const body = (req.body || {}) as Record<string, any>;
  const firstName = String(body.firstName ?? body.first_name ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? '').trim();

  if (!firstName || !lastName) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'First name and last name are required.',
    });
  }

  const insertPayload = buildDbMemberPayload(orgId, body);

  const { data, error } = await supabase
    .from('members')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    console.error('[Ekklesphere] POST /api/members Supabase error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'duplicate_member',
        message: insertPayload.phone_e164
          ? `A member with phone number ${insertPayload.phone_e164} is already registered in this church.`
          : 'A member with these unique details already exists in the database.',
      });
    }
    return res.status(400).json({
      error: 'db_insert_failed',
      message: error.message,
    });
  }

  return res.status(201).json(mapDbMemberToPerson(data));
});

app.put(['/api/v1/members/:id', '/api/members/:id'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  const memberUuid = req.params.id;

  if (!supabase) {
    return res.status(503).json({
      error: 'supabase_not_configured',
      message: 'Supabase database connection is not configured on the server.',
    });
  }

  const body = (req.body || {}) as Record<string, any>;
  const firstName = String(body.firstName ?? body.first_name ?? '').trim();
  const lastName = String(body.lastName ?? body.last_name ?? '').trim();

  if (!firstName || !lastName) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'First name and last name are required.',
    });
  }

  const updatePayload = buildDbMemberPayload(orgId, body);

  const { data, error } = await supabase
    .from('members')
    .update({
      ...updatePayload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', memberUuid)
    .eq('organization_id', orgId)
    .select('*')
    .single();

  if (error) {
    console.error('[Ekklesphere] PUT /api/members/:id Supabase error:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'duplicate_member',
        message: updatePayload.phone_e164
          ? `Another member already uses phone number ${updatePayload.phone_e164}.`
          : 'Another member already uses these unique details.',
      });
    }
    return res.status(400).json({
      error: 'db_update_failed',
      message: error.message,
    });
  }

  return res.status(200).json(mapDbMemberToPerson(data));
});

app.delete(['/api/v1/members/:id', '/api/members/:id'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  const memberUuid = req.params.id;

  if (!supabase) {
    return res.status(503).json({
      error: 'supabase_not_configured',
      message: 'Supabase database connection is not configured on the server.',
    });
  }

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', memberUuid)
    .eq('organization_id', orgId);

  if (error) {
    console.error('[Ekklesphere] DELETE /api/members/:id Supabase error:', error);
    return res.status(400).json({
      error: 'db_delete_failed',
      message: error.message,
    });
  }

  return res.status(200).json({ success: true, id: memberUuid });
});

app.post(['/api/v1/members/import', '/api/members/import'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  if (!supabase) {
    return res.status(503).json({
      error: 'supabase_not_configured',
      message: 'Supabase database connection is not configured on the server.',
    });
  }

  const rawList = Array.isArray(req.body) ? req.body : req.body?.members;
  if (!Array.isArray(rawList) || rawList.length === 0) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Provide a non-empty array of members to import.',
    });
  }

  const savedRows: Record<string, any>[] = [];
  const errors: string[] = [];

  for (const item of rawList) {
    const payload = buildDbMemberPayload(orgId, item);
    if (!payload.first_name) continue;

    if (payload.phone_e164) {
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone_e164', payload.phone_e164)
        .maybeSingle();

      if (existing?.id) {
        const { data: updated, error: updErr } = await supabase
          .from('members')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (updErr) {
          errors.push(`${payload.first_name} ${payload.last_name}: ${updErr.message}`);
        } else if (updated) {
          savedRows.push(updated);
        }
        continue;
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from('members')
      .insert(payload)
      .select('*')
      .single();

    if (insErr) {
      errors.push(`${payload.first_name} ${payload.last_name}: ${insErr.message}`);
    } else if (inserted) {
      savedRows.push(inserted);
    }
  }

  const { data: allOrgMembers } = await supabase
    .from('members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  return res.status(200).json({
    success: true,
    importedCount: savedRows.length,
    errors,
    members: (allOrgMembers || savedRows).map(mapDbMemberToPerson),
  });
});

app.get(['/api/v1/events', '/api/events'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', orgId)
      .order('starts_at', { ascending: true });
    if (!error && data) return res.json(data);
  }
  res.json([]);
});

app.post(['/api/v1/events', '/api/events'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || PRIMARY_ORGANIZATION_ID;
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Worship Service';
  const rawStartsAt = typeof req.body?.startsAt === 'string' ? req.body.startsAt.trim() : '';
  const dwellMin = Number.isFinite(Number(req.body?.dwellMinutes)) ? Math.max(1, Number(req.body.dwellMinutes)) : (premiseSettings?.dwellTimeMinutes || 5);

  let startsDate = new Date();
  if (/^\d{2}:\d{2}$/.test(rawStartsAt)) {
    const [hh, mm] = rawStartsAt.split(':').map(Number);
    startsDate.setHours(hh, mm, 0, 0);
  } else if (rawStartsAt) {
    const parsed = new Date(rawStartsAt);
    if (!Number.isNaN(parsed.getTime())) {
      startsDate = parsed;
    }
  }
  const endsDate = new Date(startsDate.getTime() + 90 * 60 * 1000);

  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        organization_id: orgId,
        site_id: PRIMARY_CAMPUS_SITE_ID,
        name,
        starts_at: startsDate.toISOString(),
        ends_at: endsDate.toISOString(),
        dwell_min: dwellMin,
        status: 'open',
      })
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  return res.status(201).json({
    id: `svc-${Date.now()}`,
    organization_id: orgId,
    site_id: PRIMARY_CAMPUS_SITE_ID,
    name,
    starts_at: startsDate.toISOString(),
    ends_at: endsDate.toISOString(),
    dwell_min: dwellMin,
    status: 'open',
  });
});

app.get(['/api/v1/attendance', '/api/attendance'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || 'e0000000-0000-0000-0000-000000000001';
  if (supabase) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*, members(first_name, last_name, phone_e164, role), events(name)')
      .eq('organization_id', orgId);
    if (!error && data && data.length > 0) return res.json(data);
  }
  const filteredEvents = inMemoryEvents.filter((ev) => ev.organization_id === orgId);
  res.json(filteredEvents);
});

// Mount Vite middleware for unified development server on port 3000
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
    console.log(`[Ekklesphere] Live Geofence Attendance Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
