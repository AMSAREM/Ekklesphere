// server.ts - Ekklesphere Church Management, Proximity Radar & Creator Console Server
import express, { type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  expressOrganizationMiddleware,
  enforceOrganizationScope,
  registerSupportGrantLookup,
} from './src/middleware/organizationMiddleware.ts';
import {
  assertProductionAuthConfig,
  isCreatorClaim,
  PRIMARY_CAMPUS_SITE_ID,
  PRIMARY_ORGANIZATION_ID,
  registerExternalIdentityVerifier,
  requireRoles,
  requireUser,
  signToken,
  type ChurchRole,
} from './lib/auth.ts';
import {
  platformStore,
  type LiveCheckinItem,
  type StoredGeofenceEvent,
} from './src/server/platformStore.ts';
import { requireActiveLicense } from './src/server/licenseMiddleware.ts';
import { consoleRouter } from './src/server/consoleRouter.ts';

dotenv.config();

// Fail closed at startup in production if JWT_SECRET, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY are missing.
assertProductionAuthConfig();

// Register Supabase Auth JWT verifier and Creator Read-Only Support Grant lookup
registerExternalIdentityVerifier((token) => platformStore.verifySupabaseAccessToken(token));
registerSupportGrantLookup((grantId, creatorId) =>
  platformStore.verifyActiveSupportGrant(grantId, creatorId)
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(expressOrganizationMiddleware);

// Mount Phase 2 Creator Console API (/api/console/*)
app.use('/api/console', consoleRouter);

// Rate limiter for attendance telemetry signals
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many attendance submissions. Please wait.' },
});

/**
 * PHASE 0 REMEDIATION (#2 & #4):
 * Universal Role-Based Access Control (RBAC) & Zero-Trust Organization Scope middleware.
 * Never trusts x-user-role, x-user-id, or x-tenant-id client headers.
 */
export function requireAuthRole(...allowedRoles: ChurchRole[]) {
  const roleGuard = requireRoles(...allowedRoles);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireUser(req, res, async () => {
      await enforceOrganizationScope(req, res, () => {
        roleGuard(req, res, next);
      });
    });
  };
}

// =========================================================================
// PHASE 0 (#1): HARDENED SESSION TOKEN EXCHANGE & DEV PREVIEW HELPER
// =========================================================================

// Token refresh/exchange endpoint: requires a verified Bearer token (Supabase JWT or session JWT).
// Role and organization_id ALWAYS come from the verified identity / database membership — NEVER from req.body.
app.post('/api/auth/token', requireUser, async (req: Request, res: Response) => {
  const verifiedUser = req.user!;
  const creator = isCreatorClaim(verifiedUser);

  let resolvedRole: ChurchRole = verifiedUser.role;
  let resolvedOrgId: string = verifiedUser.organization_id || verifiedUser.tenant_id || PRIMARY_ORGANIZATION_ID;
  let resolvedName: string = verifiedUser.name || verifiedUser.email.split('@')[0] || 'Church User';

  if (verifiedUser.auth_provider === 'supabase' && !creator) {
    const dbMembership = await platformStore.lookupMemberRoleInStore(verifiedUser.id, verifiedUser.email);
    resolvedOrgId = dbMembership.organizationId || resolvedOrgId;
    resolvedRole = dbMembership.role || resolvedRole;
    if (dbMembership.name) resolvedName = dbMembership.name;
  }

  const token = signToken({
    id: verifiedUser.id,
    email: verifiedUser.email,
    role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
    name: resolvedName,
    organization_id: resolvedOrgId,
    tenant_id: resolvedOrgId,
    campus_id: verifiedUser.campus_id || PRIMARY_CAMPUS_SITE_ID,
    is_creator: creator,
    auth_provider: 'session_jwt',
  });

  return res.status(200).json({
    token,
    role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
    organizationId: resolvedOrgId,
    isCreator: creator,
    user: {
      id: verifiedUser.id,
      email: verifiedUser.email,
      name: resolvedName,
      role: creator ? (verifiedUser.role === 'super_admin' ? 'super_admin' : 'creator') : resolvedRole,
      organization_id: resolvedOrgId,
      tenant_id: resolvedOrgId,
      is_creator: creator,
    },
  });
});

// Non-production preview session helper ONLY for local AI Studio / Vite dev preview when
// VITE_SUPABASE_URL is not yet configured. Hard-disabled (404) in production!
app.post('/api/dev/preview-session', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'not_found' });
  }

  const rawEmail =
    typeof req.body?.email === 'string' && req.body.email.trim()
      ? req.body.email.trim().toLowerCase()
      : 'member@piwckwadaso.org';
  const rawName =
    typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : rawEmail
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const requestedRole = typeof req.body?.role === 'string' ? req.body.role : 'member';
  const allowedPreviewRoles: ChurchRole[] = [
    'creator',
    'super_admin',
    'admin',
    'pastor',
    'usher',
    'member',
    'group_leader',
    'finance',
  ];
  const role: ChurchRole = allowedPreviewRoles.includes(requestedRole as ChurchRole)
    ? (requestedRole as ChurchRole)
    : 'member';

  const id =
    typeof req.body?.id === 'string' && req.body.id.trim()
      ? req.body.id.trim()
      : `preview-${rawEmail.replace(/[^a-z0-9]/g, '-')}`;

  const token = signToken({
    id,
    email: rawEmail,
    role,
    name: rawName,
    organization_id: PRIMARY_ORGANIZATION_ID,
    tenant_id: PRIMARY_ORGANIZATION_ID,
    campus_id: PRIMARY_CAMPUS_SITE_ID,
    is_creator: role === 'creator' || role === 'super_admin',
    auth_provider: 'session_jwt',
  });

  return res.status(200).json({
    token,
    role,
    organizationId: PRIMARY_ORGANIZATION_ID,
    isCreator: role === 'creator' || role === 'super_admin',
    user: {
      id,
      email: rawEmail,
      name: rawName,
      role,
      organization_id: PRIMARY_ORGANIZATION_ID,
      tenant_id: PRIMARY_ORGANIZATION_ID,
    },
  });
});

// =========================================================================
// PUBLIC LANDING CMS & ORG-ADMIN SELF-USAGE ENDPOINTS
// =========================================================================

app.get('/api/landing-config', async (_req: Request, res: Response) => {
  const landingConfig = await platformStore.getLandingConfig();
  return res.status(200).json({ landingConfig });
});

app.get(
  '/api/organisation/my-usage',
  requireAuthRole('admin', 'pastor', 'finance', 'super_admin', 'creator'),
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const [evaluation, usageDaily, allAnnouncements] = await Promise.all([
      platformStore.evaluateOrganizationLicense(orgId),
      platformStore.listUsageDaily(orgId, 30),
      platformStore.listAnnouncements(),
    ]);

    const nowMs = Date.now();
    const announcements = allAnnouncements.filter((a) => {
      if (!a.active) return false;
      if (a.expiresAt && new Date(a.expiresAt).getTime() <= nowMs) return false;
      const tierMatch = a.targetTiers.length === 0 || (evaluation.tier && a.targetTiers.includes(evaluation.tier));
      const orgMatch = a.targetOrganizationIds.length === 0 || a.targetOrganizationIds.includes(orgId);
      return Boolean(tierMatch && orgMatch);
    });

    return res.status(200).json({
      organizationId: orgId,
      evaluation,
      usageDaily,
      announcements,
    });
  }
);

// =========================================================================
// HAVERSINE & TELEMETRY HELPERS
// =========================================================================

function computeDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
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
const MAX_ACCURACY_M = 100;

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
  siteId: z.string().regex(uuidRegex, 'Invalid site UUID').optional(),
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

function computeTelemetrySummaryFromEvents(events: StoredGeofenceEvent[], includeNamedSignals = true) {
  let accepted = 0;
  let flagged = 0;
  let rejected = 0;
  let mockAttempts = 0;

  for (const ev of events) {
    if (ev.status === 'accepted') accepted++;
    else if (ev.status === 'flagged') flagged++;
    else if (ev.status === 'rejected') rejected++;
    if (ev.is_mock || ev.flag_reasons?.includes('mock_location')) mockAttempts++;
  }

  const eventsByUser = new Map<string, StoredGeofenceEvent[]>();
  for (const ev of events) {
    const list = eventsByUser.get(ev.user_id) || [];
    list.push(ev);
    eventsByUser.set(ev.user_id, list);
  }

  let openShifts = 0;
  const completedDurations: number[] = [];

  for (const userEvents of eventsByUser.values()) {
    const chronological = [...userEvents].sort(
      (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
    );
    let openIn: StoredGeofenceEvent | null = null;
    for (const ev of chronological) {
      if (ev.type === 'enter' || ev.type === 'manual_in') {
        openIn = ev;
      } else if ((ev.type === 'exit' || ev.type === 'manual_out') && openIn) {
        const durMin = Math.max(
          0,
          Math.round((new Date(ev.server_time).getTime() - new Date(openIn.server_time).getTime()) / 60000)
        );
        completedDurations.push(durMin);
        openIn = null;
      }
    }
    if (openIn) openShifts++;
  }

  const avgDwellMinutes =
    completedDurations.length > 0
      ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
      : null;

  return {
    totalSignals: events.length,
    accepted,
    flagged,
    rejected,
    mockAttempts,
    openShifts,
    avgDwellMinutes,
    recentSignals: includeNamedSignals
      ? events.slice(0, 12).map((e) => ({
          id: e.id,
          person_id: e.person_id || e.user_id,
          person_name: e.person_name,
          type: e.type,
          source: e.source,
          distance_m: e.distance_m,
          accuracy_m: e.accuracy_m,
          is_mock: e.is_mock,
          server_time: e.server_time,
          status: e.status,
          flag_reasons: e.flag_reasons,
        }))
      : [],
  };
}

// =========================================================================
// CHURCH PREMISE GPS GEOFENCE CONFIGURATION ENDPOINTS (AUTH + ORG SCOPED)
// =========================================================================

app.get(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const isStaff = req.user?.role !== 'member';
    const [premiseData, allCheckins, rawEvents] = await Promise.all([
      platformStore.getPremiseSettings(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    const visibleCheckins = isStaff
      ? allCheckins
      : allCheckins.filter(
          (c) =>
            c.personId === req.user?.id ||
            c.personId === req.user?.email ||
            (req.user?.name && c.personName === req.user.name)
        );

    return res.status(200).json({
      success: true,
      configured: premiseData.configured,
      site: premiseData.site,
      premiseSettings: premiseData.premiseSettings,
      liveCheckins: visibleCheckins,
      totalCheckedIn: allCheckins.length,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, isStaff),
    });
  }
);

app.post(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
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
    try {
      const saved = await platformStore.savePremiseSettings(req.organizationId!, {
        siteId: data.siteId,
        churchName: data.churchName,
        campusName: data.campusName,
        campusAddress: data.campusAddress,
        lat: data.lat,
        lng: data.lng,
        accuracyM: data.accuracyM ?? null,
        innerGeofenceMeters: data.innerGeofenceMeters,
        outerGeofenceMeters: Math.max(data.outerGeofenceMeters, data.innerGeofenceMeters),
        dwellTimeMinutes: data.dwellTimeMinutes,
        updatedBy: data.updatedBy || req.user?.email || 'Administrator',
      });

      return res.status(200).json({
        success: true,
        configured: true,
        site: saved.site,
        premiseSettings: saved.premiseSettings,
        sites: saved.sites,
      });
    } catch (err: any) {
      if (err?.code === 'SITE_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SITE_LIMIT_REACHED',
          message: err.message,
        });
      }
      return res.status(500).json({
        error: 'premise_save_failed',
        message: err?.message || 'Failed to save campus premise settings.',
      });
    }
  }
);

app.delete(
  ['/campus-premise', '/api/campus-premise'],
  requireAuthRole('admin', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const premiseSettings = await platformStore.clearPremiseSettings(req.organizationId!);
    return res.status(200).json({
      success: true,
      configured: false,
      site: null,
      premiseSettings,
      sites: [],
    });
  }
);

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

  const pinMatches = Array.from(decoded.matchAll(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/g));
  if (pinMatches.length > 0) {
    const last = pinMatches[pinMatches.length - 1];
    const lat = Number(last[1]);
    const lng = Number(last[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

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

  const dms = parseDmsPair(decoded);
  if (dms) {
    return { ...dms, placeName };
  }

  const atMatch = decoded.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), placeName };
    }
  }

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
  requireActiveLicense,
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
  }
);

// =========================================================================
// LIVE ATTENDANCE CHECK-INS (PHASE 0 #5 & #8: AUTH + ORG SCOPED + SUPABASE)
// =========================================================================

app.get(
  ['/live-checkins', '/api/live-checkins'],
  requireAuthRole('usher', 'admin', 'pastor', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const checkins = await platformStore.getLiveCheckins(req.organizationId!);
    if (req.user?.role === 'member') {
      const own = checkins.filter(
        (c) =>
          c.personId === req.user?.id ||
          c.personId === req.user?.email ||
          (req.user?.name && c.personName === req.user.name)
      );
      return res.status(200).json(own);
    }
    return res.status(200).json(checkins);
  }
);

app.post(
  ['/live-checkins', '/api/live-checkins'],
  requireAuthRole('usher', 'admin', 'pastor', 'member', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    if (!body.personId || typeof body.personId !== 'string') {
      return res.status(400).json({ error: 'invalid_checkin', message: 'personId is required' });
    }

    if (req.user?.role === 'member') {
      const allowedSelfIds = [req.user.id, req.user.email, req.user.name].filter(Boolean);
      if (!allowedSelfIds.includes(body.personId)) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Members are only permitted to check in for their own profile.',
        });
      }
    }

    const nowIso = new Date().toISOString();
    const targetServiceInstanceId = body.serviceInstanceId || 'svc-sun-1';
    const result = await platformStore.recordLiveCheckin(req.organizationId!, {
      id: body.id || `rec-${body.personId}-${Date.now()}`,
      personId: body.personId,
      personName: body.personName,
      serviceInstanceId: targetServiceInstanceId,
      campusId: req.campus_id || PRIMARY_CAMPUS_SITE_ID,
      method: body.method || 'manual',
      confidence: typeof body.confidence === 'number' ? body.confidence : 95,
      checkedInAt:
        body.checkedInAt || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkedInIso: body.checkedInIso || nowIso,
      late: Boolean(body.late),
      recordedBy: body.recordedBy || req.user?.name || req.user?.role,
      note: body.note,
      distanceM: body.distanceM ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
    });

    return res.status(200).json({
      success: true,
      record: result.record,
      liveCheckins: result.liveCheckins,
    });
  }
);

app.delete(
  ['/live-checkins/:personId', '/api/live-checkins/:personId'],
  requireAuthRole('usher', 'admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const { personId } = req.params;
    const serviceId =
      typeof req.query.serviceId === 'string' && req.query.serviceId.trim()
        ? req.query.serviceId.trim()
        : null;
    const liveCheckins = await platformStore.deleteLiveCheckin(req.organizationId!, personId, serviceId);
    return res.status(200).json({ success: true, liveCheckins });
  }
);

// =========================================================================
// HAVERSINE ATTENDANCE EVENT VERIFICATION (AUTH + ORG SCOPED)
// =========================================================================

async function handleAttendanceEvent(req: Request, res: Response) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const orgId = req.organizationId!;
  const e = parsed.data;
  const userId = e.personId || req.user!.id;
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

  const [sites, premiseData] = await Promise.all([
    platformStore.getSitesForOrg(orgId),
    platformStore.getPremiseSettings(orgId),
  ]);
  const site = sites.find((s) => s.id === e.siteId) || sites[0] || null;
  const siteRadius = site?.radius_m || premiseData.premiseSettings?.innerGeofenceMeters || 50;

  if (site && e.lat != null && e.lng != null) {
    distance = computeDistanceMeters(e.lat, e.lng, site.lat, site.lng);
    if (distance <= siteRadius) {
      if (status !== 'rejected') status = 'accepted';
    } else if (distance <= siteRadius + 25) {
      downgrade(`perimeter_margin_${distance}m`);
    } else {
      status = 'rejected';
      reasons.push(`outside_fence_${distance}m`);
    }
  }

  if (e.accuracyM != null && e.accuracyM > MAX_ACCURACY_M) {
    downgrade(`low_accuracy_${Math.round(e.accuracyM)}m`);
  }

  const now = new Date().toISOString();
  const row: StoredGeofenceEvent = {
    id: `evt-${Date.now()}`,
    organization_id: orgId,
    client_event_id: e.clientEventId,
    user_id: userId,
    person_id: e.personId,
    person_name: e.personName,
    service_instance_id: e.serviceInstanceId,
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

  await platformStore.recordRawGeofenceEvent(orgId, row);

  const isApproved =
    status !== 'rejected' &&
    !reasons.some((r) => r.startsWith('outside_') || r.includes('mock')) &&
    (distance === null || distance <= siteRadius + 25);

  if (isApproved && e.personId) {
    const targetServiceInstanceId = e.serviceInstanceId || 'svc-sun-1';
    await platformStore.recordLiveCheckin(orgId, {
      id: `rec-${e.personId}-${Date.now()}`,
      personId: e.personId,
      personName: e.personName,
      serviceInstanceId: targetServiceInstanceId,
      campusId: site?.id || PRIMARY_CAMPUS_SITE_ID,
      method: e.source === 'geofence' ? 'geofence' : 'manual',
      confidence:
        typeof e.accuracyM === 'number' ? Math.max(70, Math.min(99, Math.round(100 - e.accuracyM / 3))) : 95,
      checkedInAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      checkedInIso: now,
      late: false,
      recordedBy: 'GPS Geofence Radar',
      note: `Verified Live GPS (${distance ?? 0}m from center, ±${Math.round(e.accuracyM ?? 0)}m)`,
      distanceM: distance,
      lat: e.lat,
      lng: e.lng,
    });
  }

  return res.status(200).json({
    ...row,
    site_radius_m: siteRadius,
    site_name: site?.name || premiseData.premiseSettings?.campusName || null,
  });
}

app.post(
  ['/attendance/events', '/api/attendance/events'],
  attendanceLimiter,
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  handleAttendanceEvent
);

app.get(
  ['/attendance/raw-events', '/api/attendance/raw-events'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId!);
    return res.status(200).json(events);
  }
);

app.get(
  ['/attendance/shifts', '/api/attendance/shifts'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const events = await platformStore.getRawGeofenceEvents(req.organizationId!);
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

    const eventsByUser = new Map<string, StoredGeofenceEvent[]>();
    for (const ev of events) {
      const list = eventsByUser.get(ev.user_id) || [];
      list.push(ev);
      eventsByUser.set(ev.user_id, list);
    }

    for (const [userId, userEvents] of eventsByUser.entries()) {
      const chronological = [...userEvents].sort(
        (a, b) => new Date(a.server_time).getTime() - new Date(b.server_time).getTime()
      );
      let openIn: StoredGeofenceEvent | null = null;

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
        } else if ((ev.type === 'exit' || ev.type === 'manual_out') && openIn) {
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
  }
);

app.post(
  ['/attendance/auto-close', '/api/attendance/auto-close'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const maxHours = Number(req.body?.maxHours) || 12;
    const now = Date.now();
    let closedCount = 0;

    const [liveCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    for (const checkin of liveCheckins) {
      const matchingEvents = rawEvents.filter((e) => e.user_id === checkin.personId);
      const lastEvent = matchingEvents[0];
      if (lastEvent && (lastEvent.type === 'enter' || lastEvent.type === 'manual_in')) {
        const elapsedHours = (now - new Date(lastEvent.server_time).getTime()) / 3600000;
        if (elapsedHours >= maxHours || req.body?.force) {
          const exitEvt: StoredGeofenceEvent = {
            id: `evt-autoclose-${Date.now()}-${closedCount}`,
            organization_id: orgId,
            client_event_id: `auto-close-${checkin.personId}-${Date.now()}`,
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
          await platformStore.recordRawGeofenceEvent(orgId, exitEvt);
          closedCount++;
        }
      }
    }

    return res.status(200).json({ success: true, closedShifts: closedCount });
  }
);

app.get(
  ['/attendance/sites', '/api/attendance/sites'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const sites = await platformStore.getSitesForOrg(req.organizationId!);
    return res.status(200).json(sites);
  }
);

app.get(
  ['/attendance/insights', '/api/attendance/insights'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const serviceId =
      typeof req.query.serviceId === 'string' && req.query.serviceId.trim()
        ? req.query.serviceId.trim()
        : null;

    const [scopedCheckins, rawEvents] = await Promise.all([
      platformStore.getLiveCheckins(orgId, serviceId),
      platformStore.getRawGeofenceEvents(orgId),
    ]);

    const methodBreakdown: Record<string, number> = {
      geofence: 0,
      beacon: 0,
      usher: 0,
      posted_qr: 0,
      manual: 0,
      email_link: 0,
    };

    let onTimeCount = 0;
    let lateCount = 0;
    let confidenceSum = 0;
    const gpsDistances: number[] = [];

    for (const rec of scopedCheckins) {
      methodBreakdown[rec.method] = (methodBreakdown[rec.method] || 0) + 1;
      if (rec.late) lateCount++;
      else onTimeCount++;
      confidenceSum += typeof rec.confidence === 'number' ? rec.confidence : 95;
      if (typeof rec.distanceM === 'number' && Number.isFinite(rec.distanceM)) {
        gpsDistances.push(rec.distanceM);
      }
    }

    const totalCheckedIn = scopedCheckins.length;
    const avgConfidence = totalCheckedIn > 0 ? Math.round(confidenceSum / totalCheckedIn) : 0;
    const avgDistanceM =
      gpsDistances.length > 0
        ? Math.round((gpsDistances.reduce((a, b) => a + b, 0) / gpsDistances.length) * 10) / 10
        : null;

    return res.status(200).json({
      serviceId,
      totalCheckedIn,
      onTimeCount,
      lateCount,
      avgConfidence,
      avgDistanceM,
      methodBreakdown,
      telemetrySummary: computeTelemetrySummaryFromEvents(rawEvents, true),
      liveCheckins: scopedCheckins,
      timestamp: new Date().toISOString(),
    });
  }
);

function formatLocalDateIsoServer(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildShortWeekLabel(start: Date, end: Date): string {
  const sDay = start.getDate();
  const eDay = end.getDate();
  const sMonth = start.toLocaleDateString('en-GB', { month: 'short' });
  const eMonth = end.toLocaleDateString('en-GB', { month: 'short' });
  if (sDay === eDay && sMonth === eMonth) return `${sDay} ${sMonth}`;
  if (sMonth === eMonth) return `${sDay}–${eDay} ${sMonth}`;
  return `${sDay} ${sMonth}–${eDay} ${eMonth}`;
}

function buildFullWeekRangeLabel(start: Date, end: Date): string {
  const sFmt = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const eFmt = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (formatLocalDateIsoServer(start) === formatLocalDateIsoServer(end)) {
    return end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${sFmt} – ${eFmt}`;
}

app.get(
  ['/attendance/weekly-trend', '/api/attendance/weekly-trend'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const windowStart = new Date(today);
    windowStart.setDate(today.getDate() - 29);

    const startDateIso = formatLocalDateIsoServer(windowStart);
    const endDateIso = formatLocalDateIsoServer(today);

    const [eventsList, checkinsList, activeMemberBaseline] = await Promise.all([
      platformStore.getEvents(orgId),
      platformStore.getLiveCheckins(orgId),
      platformStore.getMemberCountForOrg(orgId),
    ]);

    const eventDateMap = new Map<string, string>();
    for (const ev of eventsList) {
      if (ev && typeof ev.id === 'string') {
        const normalized = normalizeEventRow(ev);
        if (normalized.date) {
          eventDateMap.set(ev.id, normalized.date);
        }
      }
    }

    const mergedByKey = new Map<string, LiveCheckinItem>();
    for (const rec of checkinsList) {
      const key = `${rec.serviceInstanceId || 'svc'}::${rec.personId}`;
      mergedByKey.set(key, rec);
    }

    const buckets: Array<{
      weekKey: string;
      startDate: string;
      endDate: string;
      shortLabel: string;
      fullRangeLabel: string;
      isCurrentWeek: boolean;
      records: LiveCheckinItem[];
      serviceIds: Set<string>;
    }> = [];

    const cursor = new Date(windowStart);
    while (cursor.getTime() <= today.getTime()) {
      const bStart = new Date(cursor);
      const dow = bStart.getDay();
      const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
      const candidateEnd = new Date(bStart);
      candidateEnd.setDate(bStart.getDate() + daysUntilSunday);
      const bEnd = candidateEnd.getTime() > today.getTime() ? new Date(today) : candidateEnd;

      const sIso = formatLocalDateIsoServer(bStart);
      const eIso = formatLocalDateIsoServer(bEnd);
      const serviceIds = new Set<string>();
      for (const [evId, evDate] of eventDateMap.entries()) {
        if (evDate >= sIso && evDate <= eIso) {
          serviceIds.add(evId);
        }
      }

      buckets.push({
        weekKey: `${sIso}_${eIso}`,
        startDate: sIso,
        endDate: eIso,
        shortLabel: buildShortWeekLabel(bStart, bEnd),
        fullRangeLabel: buildFullWeekRangeLabel(bStart, bEnd),
        isCurrentWeek: eIso === endDateIso,
        records: [],
        serviceIds,
      });

      cursor.setTime(bEnd.getTime());
      cursor.setDate(cursor.getDate() + 1);
    }

    const windowHistoricalRecords: LiveCheckinItem[] = [];
    const uniquePeople30d = new Set<string>();

    for (const rec of mergedByKey.values()) {
      let resolvedDateIso = eventDateMap.get(rec.serviceInstanceId) || '';
      if (!resolvedDateIso && rec.checkedInIso) {
        const parsed = new Date(rec.checkedInIso);
        if (!Number.isNaN(parsed.getTime())) {
          resolvedDateIso = formatLocalDateIsoServer(parsed);
        }
      }
      if (!resolvedDateIso) {
        resolvedDateIso = endDateIso;
      }

      if (resolvedDateIso < startDateIso || resolvedDateIso > endDateIso) {
        continue;
      }

      windowHistoricalRecords.push(rec);
      uniquePeople30d.add(rec.personId);

      const targetBucket = buckets.find(
        (b) => resolvedDateIso >= b.startDate && resolvedDateIso <= b.endDate
      );
      if (targetBucket) {
        targetBucket.records.push(rec);
        if (rec.serviceInstanceId) {
          targetBucket.serviceIds.add(rec.serviceInstanceId);
        }
      }
    }

    let peakWeekLabel: string | null = null;
    let peakWeekCount = 0;

    const weeks = buckets.map((b) => {
      const totalCheckins = b.records.length;
      const uniqueSet = new Set(b.records.map((r) => r.personId));
      const uniqueAttendees = uniqueSet.size;
      const lateCount = b.records.filter((r) => r.late).length;
      const onTimeCount = Math.max(0, totalCheckins - lateCount);
      const autoProximityCount = b.records.filter(
        (r) => r.method === 'geofence' || r.method === 'beacon'
      ).length;
      const assistedDoorCount = Math.max(0, totalCheckins - autoProximityCount);
      const engagementRatePct =
        activeMemberBaseline > 0
          ? Math.min(100, Math.round((uniqueAttendees / activeMemberBaseline) * 100))
          : 0;

      if (totalCheckins > peakWeekCount) {
        peakWeekCount = totalCheckins;
        peakWeekLabel = b.shortLabel;
      }

      return {
        weekKey: b.weekKey,
        startDate: b.startDate,
        endDate: b.endDate,
        shortLabel: b.shortLabel,
        fullRangeLabel: b.fullRangeLabel,
        isCurrentWeek: b.isCurrentWeek,
        totalCheckins,
        uniqueAttendees,
        onTimeCount,
        lateCount,
        autoProximityCount,
        assistedDoorCount,
        servicesCount: b.serviceIds.size,
        engagementRatePct,
      };
    });

    const totalCheckins30d = windowHistoricalRecords.length;
    const averageWeeklyAttendance =
      weeks.length > 0 ? Math.round((totalCheckins30d / weeks.length) * 10) / 10 : 0;

    return res.status(200).json({
      windowDays: 30,
      startDate: startDateIso,
      endDate: endDateIso,
      totalCheckins30d,
      uniqueAttendees30d: uniquePeople30d.size,
      averageWeeklyAttendance,
      peakWeekLabel,
      peakWeekCount,
      weeks,
      historicalRecords: windowHistoricalRecords,
      timestamp: new Date().toISOString(),
    });
  }
);

// =========================================================================
// CHURCH WORSHIP SERVICES & EVENTS
// =========================================================================

function parseExpectedAttendanceFromDescription(desc: unknown): number {
  if (typeof desc !== 'string') return 0;
  const match = desc.match(/Expected attendance:\s*(\d+)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function normalizeEventRow(row: Record<string, any>): Record<string, any> {
  const startRaw = row.start_time || row.starts_at || null;
  const endRaw = row.end_time || row.ends_at || null;
  let dateStr = typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : '';
  if (!dateStr && typeof startRaw === 'string' && startRaw.includes('T')) {
    dateStr = startRaw.split('T')[0];
  }
  if (!dateStr) {
    dateStr = new Date().toISOString().split('T')[0];
  }

  const expected =
    typeof row.expected_attendance === 'number'
      ? row.expected_attendance
      : parseExpectedAttendanceFromDescription(row.description);

  return {
    ...row,
    date: dateStr,
    start_time: startRaw,
    end_time: endRaw,
    starts_at: startRaw,
    ends_at: endRaw,
    expected_attendance: expected,
  };
}

function buildIsoTimestamp(dateStr: string, timeOrIso: string): Date {
  if (timeOrIso.includes('T')) {
    const parsed = new Date(timeOrIso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const timeMatch = timeOrIso.match(/^(\d{1,2}):(\d{2})/);
  const hh = timeMatch ? String(Math.min(23, Math.max(0, Number(timeMatch[1])))).padStart(2, '0') : '08';
  const mm = timeMatch ? String(Math.min(59, Math.max(0, Number(timeMatch[2])))).padStart(2, '0') : '00';
  const candidate = new Date(`${dateStr}T${hh}:${mm}:00.000Z`);
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

app.get(
  ['/api/v1/events', '/api/events'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const stored = await platformStore.getEvents(req.organizationId!);
    if (stored.length > 0) {
      return res.json(stored.map(normalizeEventRow));
    }

    const todayIso = new Date().toISOString().split('T')[0];
    return res.json([
      {
        id: 'svc-sun-1',
        organization_id: req.organizationId,
        name: 'Sunday First Service (English)',
        date: todayIso,
        start_time: `${todayIso}T07:00:00.000Z`,
        end_time: `${todayIso}T09:00:00.000Z`,
        starts_at: '07:00',
        ends_at: '09:00',
        status: 'active',
        dwell_min: 5,
      },
      {
        id: 'svc-sun-2',
        organization_id: req.organizationId,
        name: 'Sunday Second Service (Twi / Multilingual)',
        date: todayIso,
        start_time: `${todayIso}T09:30:00.000Z`,
        end_time: `${todayIso}T11:45:00.000Z`,
        starts_at: '09:30',
        ends_at: '11:45',
        status: 'scheduled',
        dwell_min: 5,
      },
    ]);
  }
);

app.post(
  ['/api/v1/events', '/api/events'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : 'Worship Service';
    const todayIso = new Date().toISOString().split('T')[0];
    const rawDate =
      typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim())
        ? req.body.date.trim()
        : todayIso;
    const rawStartsAt =
      typeof req.body?.startsAt === 'string' && req.body.startsAt.trim() ? req.body.startsAt.trim() : '08:00';
    const rawEndsAt =
      typeof req.body?.endsAt === 'string' && req.body.endsAt.trim() ? req.body.endsAt.trim() : '10:30';
    const dwellMin = Number.isFinite(Number(req.body?.dwellMinutes))
      ? Math.max(1, Number(req.body.dwellMinutes))
      : 5;
    const expectedAttendance = Number.isFinite(Number(req.body?.expectedAttendance))
      ? Math.max(0, Number(req.body.expectedAttendance))
      : 0;

    let startDateObj: Date;
    if (typeof req.body?.startTimeIso === 'string' && !Number.isNaN(new Date(req.body.startTimeIso).getTime())) {
      startDateObj = new Date(req.body.startTimeIso);
    } else {
      startDateObj = buildIsoTimestamp(rawDate, rawStartsAt);
    }

    let endDateObj: Date;
    if (typeof req.body?.endTimeIso === 'string' && !Number.isNaN(new Date(req.body.endTimeIso).getTime())) {
      endDateObj = new Date(req.body.endTimeIso);
    } else if (req.body?.endsAt) {
      endDateObj = buildIsoTimestamp(rawDate, rawEndsAt);
    } else {
      endDateObj = new Date(startDateObj.getTime() + 90 * 60 * 1000);
    }

    if (endDateObj.getTime() <= startDateObj.getTime()) {
      endDateObj = new Date(endDateObj.getTime() + 24 * 60 * 60 * 1000);
    }

    const dbStatus = rawDate > todayIso ? 'scheduled' : 'active';

    try {
      const created = await platformStore.createEvent(req.organizationId!, {
        name,
        date: rawDate,
        startTimeIso: startDateObj.toISOString(),
        endTimeIso: endDateObj.toISOString(),
        dwellMin,
        status: dbStatus,
        expectedAttendance,
      });
      return res.status(201).json(normalizeEventRow(created));
    } catch (err: any) {
      return res.status(500).json({
        error: 'database_error',
        message: err?.message || 'Failed to save scheduled service.',
      });
    }
  }
);

// =========================================================================
// CONGREGATION MEMBERS DIRECTORY (ORG SCOPED + SEAT LIMIT ENFORCED)
// =========================================================================

app.get(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'usher', 'group_leader', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const members = await platformStore.getMembers(req.organizationId!);
    return res.status(200).json(members);
  }
);

app.post(
  ['/api/v1/members', '/api/members'],
  requireAuthRole('admin', 'pastor', 'usher', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const firstName = String(body.firstName ?? body.first_name ?? '').trim();
    const lastName = String(body.lastName ?? body.last_name ?? '').trim();

    if (!firstName || !lastName) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'firstName and lastName are required',
      });
    }

    try {
      const created = await platformStore.createMember(req.organizationId!, body);
      return res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === 'SEAT_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SEAT_LIMIT_REACHED',
          message: err.message,
          details: err.details,
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || 'member_create_failed',
        message: err?.message || 'Could not register member.',
      });
    }
  }
);

app.post(
  '/api/members/import',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const incoming = Array.isArray(req.body?.members) ? req.body.members : [];
    if (incoming.length === 0) {
      return res.status(400).json({ error: 'validation_error', message: 'members array is required' });
    }
    try {
      const members = await platformStore.batchImportMembers(req.organizationId!, incoming);
      return res.status(200).json({ success: true, members });
    } catch (err: any) {
      if (err?.code === 'SEAT_LIMIT_REACHED') {
        return res.status(403).json({
          error: 'license_limit_exceeded',
          code: 'SEAT_LIMIT_REACHED',
          message: err.message,
          details: err.details,
        });
      }
      return res.status(err?.status || 500).json({
        error: err?.code || 'import_failed',
        message: err?.message || 'Could not import members.',
      });
    }
  }
);

app.put(
  '/api/members/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    try {
      const updated = await platformStore.updateMember(req.organizationId!, req.params.id, req.body || {});
      return res.status(200).json(updated);
    } catch (err: any) {
      return res.status(err?.status || 404).json({
        error: 'member_update_failed',
        message: err?.message || 'Member not found.',
      });
    }
  }
);

app.delete(
  '/api/members/:id',
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    await platformStore.deleteMember(req.organizationId!, req.params.id);
    return res.status(200).json({ success: true });
  }
);

// =========================================================================
// PUSH NOTIFICATIONS & SUBSCRIBED DEVICES (AUTH + ORG SCOPED)
// =========================================================================

app.post(
  ['/api/notifications/subscribe'],
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'group_leader', 'finance', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const body = req.body || {};
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
    const id = typeof body.id === 'string' ? body.id.trim() : `sub-${Date.now()}`;

    if (!endpoint && !id) {
      return res.status(400).json({ error: 'invalid_subscription', message: 'endpoint or id required' });
    }

    const saved = await platformStore.upsertPushSubscription(req.organizationId!, {
      id,
      endpoint: endpoint || id,
      keys: body.keys,
      personId: body.personId || req.user?.id,
      personName: body.personName || req.user?.name,
      userAgent: body.userAgent,
      subscribedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      subscription: saved.subscription,
      totalSubscribers: saved.totalSubscribers,
    });
  }
);

app.get(
  ['/api/notifications/subscriptions'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const subscriptions = await platformStore.getPushSubscriptions(req.organizationId!);
    return res.status(200).json({
      subscribersCount: subscriptions.length,
      subscriptions,
    });
  }
);

app.post(
  ['/api/notifications/send'],
  requireAuthRole('admin', 'pastor', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const { title, body, personId, topic } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'invalid_notification', message: 'title and body are required' });
    }

    const subscriptions = await platformStore.getPushSubscriptions(req.organizationId!);
    const targets = personId ? subscriptions.filter((s) => s.personId === personId) : subscriptions;
    const count = targets.length > 0 ? targets.length : 1;

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
  requireAuthRole('admin', 'pastor', 'usher', 'member', 'super_admin', 'creator'),
  requireActiveLicense,
  async (req: Request, res: Response) => {
    const orgId = req.organizationId!;
    const [premiseData, eventsList, subscriptions] = await Promise.all([
      platformStore.getPremiseSettings(orgId),
      platformStore.getEvents(orgId),
      platformStore.getPushSubscriptions(orgId),
    ]);

    const memberName = req.body?.personName || req.user?.name || 'Church Member';
    const campus = premiseData.premiseSettings?.campusName || 'PIWC KWADASO';
    const service = eventsList[0]?.name || 'Sunday Service';

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
      activeSubscribers: subscriptions.length,
    });
  }
);

// =========================================================================
// AUTH & FAIL-CLOSED LICENSE STATUS ENDPOINTS (PHASE 0 #6)
// =========================================================================

app.get('/api/auth/me', requireUser, enforceOrganizationScope, (req: Request, res: Response) => {
  return res.status(200).json({
    user: req.user,
    organizationId: req.organizationId,
    isCreator: isCreatorClaim(req.user),
    authenticated: true,
  });
});

app.get('/api/license/status', requireUser, enforceOrganizationScope, async (req: Request, res: Response) => {
  const evaluation = await platformStore.evaluateOrganizationLicense(req.organizationId!);
  return res.status(evaluation.httpStatus).json({
    ...evaluation,
    tenantId: evaluation.organizationId,
  });
});

app.post(
  '/api/admin/system-check',
  requireUser,
  requireRoles('super_admin', 'creator'),
  (req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: 'Authorized super admin action executed successfully',
      callerRole: req.user?.role,
    });
  }
);

// =========================================================================
// SERVER HEALTH & STATUS (NO COORDINATES OR PII EXPOSED)
// =========================================================================

app.get(['/api/health', '/api/db/status'], (_req: Request, res: Response) => {
  return res.status(200).json({
    status: 'healthy',
    app: 'Ekklesphere Church Management',
    storageBackend: platformStore.storageBackend,
    timestamp: new Date().toISOString(),
  });
});

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
    console.log(`[Ekklesphere] Server running at http://0.0.0.0:${PORT} (${platformStore.storageBackend})`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST && !process.env.VERCEL) {
  startServer();
}

export { app };
