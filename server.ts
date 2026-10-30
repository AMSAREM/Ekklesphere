// server.ts - Full-Stack Express Server with Geofence Attendance API & Vite Middleware
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { expressOrganizationMiddleware } from './src/middleware/organizationMiddleware.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

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

// In-memory store for fallback/dev demo and audit trail when Supabase is connecting
interface StoredEvent {
  id: string;
  organization_id: string;
  client_event_id: string;
  user_id: string;
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

const inMemoryEvents: StoredEvent[] = [];

// Default sites (mutable for live GPS calibration testing)
interface RegisteredSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}

const DEFAULT_SITES: RegisteredSite[] = [
  {
    id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Accra Central Church Sanctuary',
    lat: 5.5560,
    lng: -0.1969,
    radius_m: 150,
  },
  {
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'North Kaneshie Ministry Center',
    lat: 5.5724,
    lng: -0.2315,
    radius_m: 120,
  },
];

let registeredSites: RegisteredSite[] = [...DEFAULT_SITES];

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(expressOrganizationMiddleware);

// Rate limit: 30 requests per minute per IP for attendance events
const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many attendance submissions. Please wait.' },
});

// Haversine formula for server-side distance verification
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
async function requireUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (supabase && token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      (req as any).user = data.user;
      return next();
    }
  }

  // Development / Demo Fallback user if no token provided or running locally
  (req as any).user = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'ama.owusu@accracentral.org',
    role: 'authenticated',
  };
  next();
}

// Validation schema with standard 8-4-4-4-12 UUID validator
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EventSchema = z.object({
  clientEventId: z.string().regex(uuidRegex, 'Invalid UUID'),
  siteId: z.string().regex(uuidRegex, 'Invalid UUID'),
  organizationId: z.string().regex(uuidRegex, 'Invalid UUID').optional(),
  type: z.enum(['enter', 'exit', 'manual_in', 'manual_out']),
  source: z.enum(['geofence', 'manual', 'web']),
  platform: z.enum(['android', 'web']).default('android'),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  accuracyM: z.number().nonnegative().nullable(),
  isMock: z.boolean().default(false),
  deviceTime: z.string().datetime(),
});

const MAX_ACCURACY_M = 100;
const MAX_SLACK_M = 50;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_TRAVEL_KMH = 150;

// POST /attendance/events (also mounted at /api/attendance/events)
async function handleAttendanceEvent(req: Request, res: Response) {
  const parsed = EventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_payload', details: parsed.error.flatten() });
  }

  const e = parsed.data;
  const userId = (req as any).user.id;
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

  // 1. Recompute geometry on the server
  if (e.lat == null || e.lng == null) {
    reasons.push('no_location');
    status = 'flagged';
  } else {
    let site = registeredSites.find((s) => s.id === e.siteId);
    let siteRadius = site ? site.radius_m : 150;

    if (supabase) {
      try {
        const { data: dbDist, error } = await supabase
          .rpc('site_distance', { p_site: e.siteId, p_lng: e.lng, p_lat: e.lat })
          .single();
        if (!error && dbDist) {
          const resObj = dbDist as { distance_m: number; radius_m: number };
          distance = resObj.distance_m;
          siteRadius = resObj.radius_m;
        }
      } catch (err) {
        console.warn('Supabase site_distance RPC error, falling back to Haversine', err);
      }
    }

    if (distance === null && site) {
      distance = computeDistanceMeters(site.lat, site.lng, e.lat, e.lng);
    }

    if (!site && distance === null) {
      return res.status(404).json({ error: 'unknown_site' });
    }

    const slack = Math.min(e.accuracyM ?? MAX_SLACK_M, MAX_SLACK_M);
    if (distance !== null && distance > siteRadius + slack) {
      reasons.push('outside_site');
      status = 'rejected';
    }

    // 2. Impossible travel check
    const previousLocated = inMemoryEvents
      .filter((ev) => ev.user_id === userId && ev.lat !== null && ev.lng !== null && ev.status !== 'rejected')
      .slice(-1)[0];

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
  if (e.isMock) downgrade('mock_location');
  if (e.platform === 'web') downgrade('web_unverified_device');
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
    site_id: e.siteId,
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

  // If Supabase is connected, persist into Supabase
  if (supabase) {
    try {
      const dbRow = {
        client_event_id: e.clientEventId,
        user_id: userId,
        site_id: e.siteId,
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

  return res.status(200).json(row);
}

// Routes
app.post('/attendance/events', attendanceLimiter, requireUser, handleAttendanceEvent);
app.post('/api/attendance/events', attendanceLimiter, requireUser, handleAttendanceEvent);

// Fetch registered sites
app.get(['/attendance/sites', '/api/attendance/sites'], (_req: Request, res: Response) => {
  res.status(200).json(registeredSites);
});

// Calibrate or register a site dynamically (e.g. user's current live GPS location)
app.post(['/attendance/calibrate-site', '/api/attendance/calibrate-site'], (req: Request, res: Response) => {
  const { siteId, name, lat, lng, radius_m } = req.body;
  if (lat == null || lng == null || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'invalid_coordinates', message: 'lat and lng must be valid numbers' });
  }

  const radius = Number(radius_m) || 150;
  const siteName = name || 'Live Calibrated Sanctuary (Browser GPS Target)';
  const targetId = siteId || 'c0000000-0000-0000-0000-000000000003';

  const existingIdx = registeredSites.findIndex((s) => s.id === targetId);
  const updatedSite: RegisteredSite = {
    id: targetId,
    name: siteName,
    lat,
    lng,
    radius_m: radius,
  };

  if (existingIdx >= 0) {
    registeredSites[existingIdx] = updatedSite;
  } else {
    registeredSites.push(updatedSite);
  }

  res.status(200).json({
    success: true,
    message: `Site successfully calibrated to live GPS (${lat.toFixed(6)}, ${lng.toFixed(6)}) with radius ${radius}m`,
    calibratedSite: updatedSite,
    sites: registeredSites,
  });
});

// Reset sites back to Accra Central defaults
app.post(['/attendance/reset-sites', '/api/attendance/reset-sites'], (_req: Request, res: Response) => {
  registeredSites = [...DEFAULT_SITES];
  res.status(200).json({
    success: true,
    message: 'Registered sites restored to default campuses.',
    sites: registeredSites,
  });
});

// Fetch raw audit events
app.get(['/attendance/raw-events', '/api/attendance/raw-events'], (_req: Request, res: Response) => {
  res.status(200).json(inMemoryEvents.slice(0, 100));
});

// Calculate shift pairings (implements the 'shifts' view logic)
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

  let currentShift: any = null;

  for (const ev of validEvents) {
    const isEnter = ev.type === 'enter' || ev.type === 'manual_in';
    const isExit = ev.type === 'exit' || ev.type === 'manual_out';

    if (isEnter) {
      if (!currentShift) {
        currentShift = {
          user_id: ev.user_id,
          site_id: ev.site_id,
          in_event_id: ev.id,
          clock_in: ev.server_time,
          out_event_id: null,
          clock_out: null,
          duration_minutes: null,
          needs_review: ev.status === 'flagged',
          is_open: true,
        };
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
      currentShift = null;
    }
  }

  if (currentShift) {
    shifts.push(currentShift);
  }

  res.status(200).json(shifts.reverse());
});

// Auto-close open shifts endpoint (simulates pg_cron auto_close_open_shifts)
app.post(['/attendance/auto-close', '/api/attendance/auto-close'], (req: Request, res: Response) => {
  const maxHours = req.body?.maxHours || 12;
  const cutoff = Date.now() - maxHours * 3600 * 1000;

  let closedCount = 0;
  // Find open events without a subsequent exit
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
      totalEventsLogged: inMemoryEvents.length,
      sitesMonitored: registeredSites.length,
    },
  });
});

// Multi-tenant API routes for organizations, members, events, and attendance
const demoOrganizations = [
  {
    id: 'e0000000-0000-0000-0000-000000000001',
    name: 'Accra Central Church',
    slug: 'accra-central',
    timezone: 'Africa/Accra',
    settings: {
      currency: 'GHS',
      absence_threshold_leader: 2,
      absence_threshold_pastor: 3,
      dwell_min_default: 5,
    },
  },
];

const demoMembers = [
  {
    id: 'm0000000-0000-0000-0000-000000000001',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    user_id: '00000000-0000-0000-0000-000000000001',
    first_name: 'Ama',
    last_name: 'Owusu',
    role: 'admin',
    status: 'active',
    phone_e164: '+233241234567',
    email: 'ama.owusu@accracentral.org',
  },
  {
    id: 'm0000000-0000-0000-0000-000000000002',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    first_name: 'Kofi',
    last_name: 'Mensah',
    role: 'member',
    status: 'active',
    phone_e164: '+233249876543',
    email: 'kofi.mensah@gmail.com',
  },
  {
    id: 'm0000000-0000-0000-0000-000000000003',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    first_name: 'Kwame',
    last_name: 'Boateng',
    role: 'usher',
    status: 'active',
    phone_e164: '+233205551234',
    email: 'kwame.boateng@gmail.com',
  },
  {
    id: 'm0000000-0000-0000-0000-000000000004',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    first_name: 'Abena',
    last_name: 'Antwi',
    role: 'pastor',
    status: 'active',
    phone_e164: '+233267778899',
    email: 'abena.antwi@gmail.com',
  },
];

const demoEvents = [
  {
    id: 'ev000000-0000-0000-0000-000000000001',
    organization_id: 'e0000000-0000-0000-0000-000000000001',
    name: 'Sunday Morning Celebration Service',
    description: 'Weekly Sunday Main Service at Accra Central Sanctuary',
    location: 'Accra Central Sanctuary, Ring Road Central, Accra',
    start_time: new Date(Date.now() - 60 * 60000).toISOString(),
    end_time: new Date(Date.now() + 120 * 60000).toISOString(),
    status: 'active',
    dwell_min: 5,
  },
];

app.get(['/api/v1/organizations', '/api/organizations'], async (req: Request, res: Response) => {
  if (supabase) {
    const { data, error } = await supabase.from('organizations').select('*');
    if (!error && data && data.length > 0) return res.json(data);
  }
  res.json(demoOrganizations);
});

app.get(['/api/v1/members', '/api/members'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || 'e0000000-0000-0000-0000-000000000001';
  if (supabase) {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('organization_id', orgId);
    if (!error && data && data.length > 0) return res.json(data);
  }
  res.json(demoMembers.filter((m) => m.organization_id === orgId));
});

app.get(['/api/v1/events', '/api/events'], async (req: Request, res: Response) => {
  const orgId = (req as any).organizationId || 'e0000000-0000-0000-0000-000000000001';
  if (supabase) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('organization_id', orgId);
    if (!error && data && data.length > 0) return res.json(data);
  }
  res.json(demoEvents.filter((ev) => ev.organization_id === orgId));
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

// Seed an initial demo event for Accra Central so the dashboard starts with realistic data
inMemoryEvents.push({
  id: 'evt-init-001',
  organization_id: 'e0000000-0000-0000-0000-000000000001',
  client_event_id: 'c0000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000001',
  site_id: 'a0000000-0000-0000-0000-000000000001',
  type: 'enter',
  source: 'geofence',
  platform: 'android',
  lat: 5.5562,
  lng: -0.1968,
  accuracy_m: 14,
  distance_m: 28.5,
  is_mock: false,
  device_time: new Date(Date.now() - 45 * 60000).toISOString(),
  server_time: new Date(Date.now() - 45 * 60000).toISOString(),
  status: 'accepted',
  flag_reasons: [],
});

// Mount Vite middleware for unified development server on port 3000
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
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
    console.log(`[Ekklesphere] Full-stack Geofence Attendance Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
